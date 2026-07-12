'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getPipeline } from '../components/pipelines';

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

// אחרי הוספת/שיוך ליד למחלקה שונה מזו שהמשתמש נמצא בה כרגע, מעביר אותו
// אליה אוטומטית - אבל רק אם יש לו באמת חברות שם (אחרת הוא ייחסם עם
// "אין לך גישה למחלקה זו" כשהוא מגיע לשם)
async function maybeSwitchActiveWorkspace(supabase, user, targetWorkspaceId) {
  const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
  if (profile?.current_workspace_id === targetWorkspaceId) return;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', targetWorkspaceId)
    .single();

  if (membership) {
    await supabase.from('profiles').update({ current_workspace_id: targetWorkspaceId }).eq('id', user.id);
  }
}

// מוסיף איש קשר למחלקה נתונה (contact_departments) בלי לגעת בשיוך שלו
// לשאר המחלקות - אדם יכול להיות פעיל בכמה מחלקות בו-זמנית, כל אחת עם
// שלב משלה. אם כבר יש שיוך למחלקה הזו - רק מרעננים "טיפול אחרון".
async function upsertDepartmentMembership(supabase, contactId, workspace) {
  const { data: existingRow } = await supabase
    .from('contact_departments')
    .select('id')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspace.id)
    .single();

  if (existingRow) {
    await supabase.from('contact_departments').update({ last_activity_at: new Date().toISOString() }).eq('id', existingRow.id);
    return;
  }

  const pipeline = getPipeline(workspace.name);
  await supabase.from('contact_departments').insert({
    contact_id: contactId, workspace_id: workspace.id, stage: pipeline.order[0], last_activity_at: new Date().toISOString(),
  });
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
// "ליד נכנס": אם האדם כבר קיים, לא נוצר כרטיס כפול - מוסיפים לו שיוך למחלקה
async function findExistingMatch(supabase, { idnum, phone, email }) {
  const clauses = [];
  if (idnum) clauses.push(`idnum.eq.${idnum}`);
  if (phone) clauses.push(`phone.eq.${phone}`);
  if (email) clauses.push(`email.eq.${email}`);
  if (clauses.length === 0) return null;

  const { data } = await supabase
    .from('contacts')
    .select('id, tags')
    .or(clauses.join(','))
    .limit(1);

  return data?.[0] || null;
}

// בדיקה "רכה" לפני יצירה - מציגה למשתמש התאמות אפשריות (כולל שם דומה, לא
// רק התאמה מדויקת) כדי שהוא יאשר בעצמו אם זה אותו אדם, במקום מיזוג שקט
export async function checkPossibleDuplicates({ first, last, phone, email, idnum }) {
  const { supabase } = await requireUser();
  const clauses = [];
  if (idnum) clauses.push(`idnum.eq.${idnum}`);
  if (phone) clauses.push(`phone.eq.${phone}`);
  if (email) clauses.push(`email.eq.${email}`);
  if (first && first.trim().length >= 2) {
    const f = first.trim();
    const l = (last || '').trim();
    clauses.push(l ? `and(first.ilike.%${f}%,last.ilike.%${l}%)` : `first.ilike.%${f}%`);
  }
  if (clauses.length === 0) return [];

  const { data } = await supabase
    .from('contacts')
    .select('id, first, last, idnum, phone, phone2, email, source, dept, tags, contact_departments (stage, workspaces:workspace_id (name))')
    .or(clauses.join(','))
    .limit(5);

  return (data || []).map((c) => ({
    id: c.id, first: c.first, last: c.last, idnum: c.idnum, phone: c.phone, phone2: c.phone2,
    email: c.email, source: c.source, dept: c.dept, tags: c.tags || [],
    departments: (c.contact_departments || []).map((d) => d.workspaces?.name).filter(Boolean),
  }));
}

// שיוך ליד חדש לאיש קשר קיים, אחרי שהמשתמש בחר ידנית שדה-שדה מה להשאיר
// (resolvedFields: אובייקט רגיל עם הערכים הסופיים שנבחרו, לא FormData)
export async function mergeResolvedLead(existingId, resolvedFields, workspaceId) {
  const { supabase, user } = await requireUser();
  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };

  const update = { tags: resolvedFields.tags || [] };
  for (const field of EDITABLE_FIELDS) {
    if (field in resolvedFields) update[field] = resolvedFields[field] || null;
  }

  const { error } = await supabase.from('contacts').update(update).eq('id', existingId);
  if (error) return { error: error.message };

  await upsertDepartmentMembership(supabase, existingId, workspace);
  await maybeSwitchActiveWorkspace(supabase, user, workspace.id);
  redirect(`/dashboard/contacts/${existingId}`);
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

// יצירת ליד/איש קשר חדש (ידני) - משויך למחלקה שנבחרה בטופס.
// לפני היצירה מחפש התאמה קיימת (ת"ז/טלפון/מייל) - אם נמצאה, לא נוצר כרטיס
// כפול: לאיש הקיים פשוט מתווסף שיוך למחלקה הזו (בלי לגעת בשיוכים אחרים
// שכבר יש לו - אדם יכול להיות פעיל בכמה מחלקות בו-זמנית).
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
  const forceNew = formData.get('force_new') === 'true';

  const existing = forceNew ? null : await findExistingMatch(supabase, { idnum, phone, email });

  if (existing) {
    const mergedTags = Array.from(new Set([...(existing.tags || []), ...newTags]));
    const update = { tags: mergedTags };
    for (const field of EDITABLE_FIELDS) {
      if (formData.has(field) && formData.get(field)) update[field] = formData.get(field);
    }
    const { error } = await supabase.from('contacts').update(update).eq('id', existing.id);
    if (error) return { error: error.message };

    await upsertDepartmentMembership(supabase, existing.id, workspace);
    await maybeSwitchActiveWorkspace(supabase, user, workspace.id);
    redirect(`/dashboard/contacts/${existing.id}`);
  }

  const insert = { idnum, phone, email, tags: newTags };
  for (const field of EDITABLE_FIELDS) {
    if (formData.has(field) && !(field in insert)) insert[field] = formData.get(field) || null;
  }

  const { data, error } = await supabase.from('contacts').insert(insert).select('id').single();
  if (error) return { error: error.message };

  await upsertDepartmentMembership(supabase, data.id, workspace);
  await maybeSwitchActiveWorkspace(supabase, user, workspace.id);
  redirect(`/dashboard/contacts/${data.id}`);
}

// מחיקת איש קשר - כל משתמש מחובר יכול
export async function deleteContact(contactId) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) return { error: error.message };
  redirect('/dashboard/contacts');
}

// הסרת שיוך איש קשר למחלקה ספציפית בלבד (לא מוחק את הכרטיס, רק את
// השיוך למחלקה הזו - שאר המחלקות שהוא פעיל בהן נשארות)
export async function removeDepartmentMembership(contactId, workspaceId) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from('contact_departments').delete().eq('contact_id', contactId).eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  redirect(`/dashboard/contacts/${contactId}`);
}

// הוספת שיוך למחלקה נוספת מתוך כרטיס איש הקשר עצמו
export async function addDepartmentMembership(contactId, workspaceId) {
  const { supabase } = await requireUser();
  const { data: workspace } = await supabase.from('workspaces').select('id, name').eq('id', workspaceId).single();
  if (!workspace) return { error: 'מחלקה לא נמצאה' };
  await upsertDepartmentMembership(supabase, contactId, workspace);
  redirect(`/dashboard/contacts/${contactId}`);
}

// עדכון שלב/סיבת סגירה של איש קשר במחלקה ספציפית
export async function updateDepartmentStage(departmentRowId, stage, closedReason) {
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from('contact_departments').select('contact_id').eq('id', departmentRowId).single();
  if (!row) return { error: 'שיוך לא נמצא' };

  const { error } = await supabase.from('contact_departments')
    .update({ stage, closed_reason: stage === 'closed' ? (closedReason || null) : null, last_activity_at: new Date().toISOString() })
    .eq('id', departmentRowId);
  if (error) return { error: error.message };

  redirect(`/dashboard/contacts/${row.contact_id}`);
}

// איחוד שני אנשי קשר כפולים: keepId נשאר, duplicateId נמחק אחרי שהפגישות/משימות
// והשיוכים למחלקות שלו עוברים אליו
export async function mergeContacts(keepId, duplicateId) {
  const { supabase } = await requireUser();
  if (keepId === duplicateId) return { error: 'לא ניתן לאחד איש קשר עם עצמו' };

  const { error: meetingsError } = await supabase
    .from('meetings').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (meetingsError) return { error: meetingsError.message };

  const { error: tasksError } = await supabase
    .from('tasks').update({ contact_id: keepId }).eq('contact_id', duplicateId);
  if (tasksError) return { error: tasksError.message };

  // מעביר שיוכי מחלקה של הכפול לכרטיס הנשאר, מדלג על מחלקות שכבר קיימות שם
  const { data: dupDepartments } = await supabase.from('contact_departments').select('*').eq('contact_id', duplicateId);
  const { data: keepDepartments } = await supabase.from('contact_departments').select('workspace_id').eq('contact_id', keepId);
  const keepWorkspaceIds = new Set((keepDepartments || []).map((d) => d.workspace_id));
  for (const d of dupDepartments || []) {
    if (!keepWorkspaceIds.has(d.workspace_id)) {
      await supabase.from('contact_departments').insert({
        contact_id: keepId, workspace_id: d.workspace_id, stage: d.stage,
        closed_reason: d.closed_reason, agent_id: d.agent_id, last_activity_at: d.last_activity_at,
      });
    }
  }

  const { data: dup } = await supabase.from('contacts').select('tags').eq('id', duplicateId).single();
  const { data: keep } = await supabase.from('contacts').select('tags').eq('id', keepId).single();
  const mergedTags = Array.from(new Set([...(keep?.tags || []), ...(dup?.tags || [])]));
  await supabase.from('contacts').update({ tags: mergedTags }).eq('id', keepId);

  const { error: deleteError } = await supabase.from('contacts').delete().eq('id', duplicateId);
  if (deleteError) return { error: deleteError.message };

  redirect(`/dashboard/contacts/${keepId}`);
}

// ייבוא אנשי קשר בכמות (מקובץ CSV/אקסל) - משויכים למחלקה שנבחרה.
// כמו ביצירה ידנית: לכל שורה נבדקת התאמה קיימת (ת"ז/טלפון/מייל) לפני יצירה,
// כדי למנוע כרטיסים כפולים - למי שכבר קיים רק מתווסף שיוך למחלקה הזו.
export async function importContacts(rows, workspaceId) {
  const { supabase, user } = await requireUser();
  const workspace = await resolveTargetWorkspace(supabase, user, workspaceId);
  if (!workspace.id) return { error: 'לא נמצא workspace פעיל' };
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'לא נמצאו שורות לייבוא' };

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
      const mergedTags = Array.from(new Set([...(existing.tags || []), ...rowTags]));
      await supabase.from('contacts').update({ tags: mergedTags }).eq('id', existing.id);
      await upsertDepartmentMembership(supabase, existing.id, workspace);
      merged++;
      continue;
    }

    const { data: created_contact } = await supabase.from('contacts').insert({
      first: (r.first || '').toString().trim(),
      last: (r.last || '').toString().trim() || null,
      phone, idnum, email,
      phone2: (r.phone2 || '').toString().trim() || null,
      dept: (r.dept || '').toString().trim() || null,
      source: (r.source || '').toString().trim() || 'ייבוא אקסל',
      tags: rowTags,
    }).select('id').single();
    if (created_contact) await upsertDepartmentMembership(supabase, created_contact.id, workspace);
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

// קביעת נציג מטפל בליד במחלקה ספציפית (לתצוגה בלבד - לא נועל את הליד)
export async function assignAgent(contactId, workspaceId, agentId) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from('contact_departments')
    .update({ agent_id: agentId || null, last_activity_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  return { success: true };
}
