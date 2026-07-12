'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getPipeline, roleTag } from '../components/pipelines';

const EDITABLE_FIELDS = ['first', 'last', 'phone', 'phone2', 'email', 'dept', 'source', 'idnum'];

function parseTags(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function currentWorkspace(supabase, user) {
  const { data: profile } = await supabase
    .from('profiles').select('current_workspace_id, workspaces:current_workspace_id (name)').eq('id', user.id).single();
  return { id: profile?.current_workspace_id || null, name: profile?.workspaces?.name || null };
}

// מחלקה מפורשת שנבחרה בטופס (במקום להניח שזו תמיד ה-workspace הפעיל של היוצר)
async function resolveTargetWorkspace(supabase, user, explicitId) {
  if (!explicitId) return currentWorkspace(supabase, user);
  const { data } = await supabase.from('workspaces').select('id, name').eq('id', explicitId).single();
  return data ? { id: data.id, name: data.name } : currentWorkspace(supabase, user);
}

export async function listWorkspaces() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('workspaces').select('id, name').order('created_at', { ascending: true });
  return data || [];
}

// כל התגיות שכבר בשימוש במערכת (לרשימה הנפתחת בטופס תגיות)
export async function listAllTags() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('contacts').select('tags');
  const set = new Set();
  (data || []).forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

// מחפש איש קשר קיים לפי ת"ז/טלפון/מייל (זיהוי כפילויות לפי האפיון) - לצורך
// "ליד נכנס": אם האדם כבר קיים, לא נוצר כרטיס כפול - מעדכנים את הקיים
async function findExistingMatch(supabase, { idnum, phone, email }) {
  const clauses = [];
  if (idnum) clauses.push(`idnum.eq.${idnum}`);
  if (phone) clauses.push(`phone.eq.${phone}`);
  if (email) clauses.push(`email.eq.${email}`);
  if (clauses.length === 0) return null;

  const { data } = await supabase
    .from('contacts')
    .select('id, workspace_id, stage, tags, workspaces:workspace_id (name)')
    .or(clauses.join(','))
    .limit(1);

  return data?.[0] || null;
}

// עדכון פרטי איש קשר - כל משתמש מחובר יכול (contacts משותפים לכולם)
export async function updateContact(contactId, formData) {
  const { supabase } = await requireUser();

  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (formData.has(field)) update[field] = formData.get(field) || null;
  }
  if (formData.has('tags')) update.tags = parseTags(formData.get('tags'));

  const { error } = await supabase.from('contacts').update(update).eq('id', contactId);
  if (error) return { error: error.message };

  redirect(`/dashboard/contacts/${contactId}`);
}

// יצירת ליד/איש קשר חדש (ידני) - נכנס ל-workspace הנוכחי של היוצר.
// לפני היצירה מחפש התאמה קיימת (ת"ז/טלפון/מייל) - אם נמצאה, לא נוצר כרטיס כפול:
// האיש הקיים "עובר" למחלקה הנוכחית (שלב ראשון ב-pipeline שלה), ומקבל תגית
// שמשמרת את ההיסטוריה שלו במחלקה הקודמת (למשל "בוגר דעת למדני").
export async function createContact(formData) {
  const { supabase, user } = await requireUser();
  const workspace = await resolveTargetWorkspace(supabase, user, formData.get('workspace_id'));
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };

  const first = (formData.get('first') || '').toString().trim();
  if (!first) return { error: 'יש להזין שם פרטי' };

  const idnum = (formData.get('idnum') || '').toString().trim() || null;
  const phone = (formData.get('phone') || '').toString().trim() || null;
  const email = (formData.get('email') || '').toString().trim() || null;
  const newTags = formData.has('tags') ? parseTags(formData.get('tags')) : [];
  const pipeline = getPipeline(workspace.name);

  const existing = await findExistingMatch(supabase, { idnum, phone, email });

  if (existing) {
    const previousTag = roleTag(existing.workspaces?.name, existing.stage);
    const mergedTags = Array.from(new Set([...(existing.tags || []), ...newTags, ...(previousTag ? [previousTag] : [])]));

    const update = {
      workspace_id: workspace.id,
      stage: pipeline.order[0],
      tags: mergedTags,
      last_activity_at: new Date().toISOString(),
    };
    for (const field of EDITABLE_FIELDS) {
      if (formData.has(field) && formData.get(field)) update[field] = formData.get(field);
    }

    const { error } = await supabase.from('contacts').update(update).eq('id', existing.id);
    if (error) return { error: error.message };

    redirect(`/dashboard/contacts/${existing.id}`);
  }

  const insert = {
    workspace_id: workspace.id, stage: pipeline.order[0], last_activity_at: new Date().toISOString(),
    idnum, phone, email, tags: newTags,
  };
  for (const field of EDITABLE_FIELDS) {
    if (formData.has(field) && !(field in insert)) insert[field] = formData.get(field) || null;
  }

  const { data, error } = await supabase.from('contacts').insert(insert).select('id').single();
  if (error) return { error: error.message };

  redirect(`/dashboard/contacts/${data.id}`);
}

// מחיקת איש קשר - כל משתמש מחובר יכול
export async function deleteContact(contactId) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) return { error: error.message };
  redirect('/dashboard/contacts');
}

// איחוד שני אנשי קשר כפולים: keepId נשאר, duplicateId נמחק אחרי שהפגישות/משימות שלו עוברות אליו
export async function mergeContacts(keepId, duplicateId) {
  const { supabase } = await requireUser();
  if (keepId === duplicateId) return { error: 'לא ניתן לאחד איש קשר עם עצמו' };

  const { error: meetingsError } = await supabase
    .from('meetings').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (meetingsError) return { error: meetingsError.message };

  const { error: tasksError } = await supabase
    .from('tasks').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (tasksError) return { error: tasksError.message };

  const { data: dup } = await supabase.from('contacts').select('tags').eq('id', duplicateId).single();
  const { data: keep } = await supabase.from('contacts').select('tags').eq('id', keepId).single();
  const mergedTags = Array.from(new Set([...(keep?.tags || []), ...(dup?.tags || [])]));
  await supabase.from('contacts').update({ tags: mergedTags }).eq('id', keepId);

  const { error: deleteError } = await supabase.from('contacts').delete().eq('id', duplicateId);
  if (deleteError) return { error: deleteError.message };

  redirect(`/dashboard/contacts/${keepId}`);
}

// ייבוא אנשי קשר בכמות (מקובץ CSV/אקסל) - נכנס ל-workspace הנוכחי.
// כמו ביצירה ידנית: לכל שורה נבדקת התאמה קיימת (ת"ז/טלפון/מייל) לפני יצירה,
// כדי למנוע כרטיסים כפולים ולשמר היסטוריה בין-מחלקתית כתגית.
export async function importContacts(rows, workspaceId) {
  const { supabase, user } = await requireUser();
  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'לא נמצאו שורות לייבוא' };

  const now = new Date().toISOString();
  const pipeline = getPipeline(workspace.name);
  const validRows = rows.filter((r) => (r.first || '').toString().trim());
  if (validRows.length === 0) return { error: 'אף שורה לא הכילה שם פרטי' };

  let created = 0;
  let merged = 0;

  for (const r of validRows) {
    const idnum = (r.idnum || '').toString().trim() || null;
    const phone = (r.phone || '').toString().trim() || null;
    const email = (r.email || '').toString().trim() || null;
    const rowTags = (r.tags || '').toString().split(',').map((t) => t.trim()).filter(Boolean);

    const existing = await findExistingMatch(supabase, { idnum, phone, email });

    if (existing) {
      const previousTag = roleTag(existing.workspaces?.name, existing.stage);
      const mergedTags = Array.from(new Set([...(existing.tags || []), ...rowTags, ...(previousTag ? [previousTag] : [])]));
      await supabase.from('contacts').update({
        workspace_id: workspace.id,
        stage: pipeline.order[0],
        tags: mergedTags,
        last_activity_at: now,
      }).eq('id', existing.id);
      merged++;
      continue;
    }

    await supabase.from('contacts').insert({
      workspace_id: workspace.id,
      stage: pipeline.order[0],
      last_activity_at: now,
      first: (r.first || '').toString().trim(),
      last: (r.last || '').toString().trim() || null,
      phone, idnum, email,
      phone2: (r.phone2 || '').toString().trim() || null,
      dept: (r.dept || '').toString().trim() || null,
      source: (r.source || '').toString().trim() || 'ייבוא אקסל',
      tags: rowTags,
    });
    created++;
  }

  return { success: true, count: created + merged, created, merged };
}

// חיפוש אנשי קשר (לצורך איחוד כפולים) - מחזיר עד 8 תוצאות, לא כולל את עצמו
export async function searchContacts(query, excludeId) {
  const { supabase } = await requireUser();
  if (!query || query.trim().length < 2) return [];

  const { data } = await supabase
    .from('contacts')
    .select('id, first, last, phone, email')
    .neq('id', excludeId)
    .or(`first.ilike.%${query}%,last.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(8);

  return data || [];
}

// קביעת נציג מטפל בליד (לתצוגה בלבד - לא נועל את הליד, כל אחד עדיין יכול לטפל)
export async function assignAgent(contactId, agentId) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from('contacts')
    .update({ agent_id: agentId || null, last_activity_at: new Date().toISOString() })
    .eq('id', contactId);
  if (error) return { error: error.message };
  return { success: true };
}

// עדכון "טיפול אחרון" - נקרא בכל פעולה משמעותית על הליד (למשל שינוי שלב)
export async function touchContactActivity(contactId) {
  const { supabase } = await requireUser();
  await supabase.from('contacts').update({ last_activity_at: new Date().toISOString() }).eq('id', contactId);
}
