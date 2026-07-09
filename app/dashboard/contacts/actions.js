'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';

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

async function currentWorkspaceId(supabase, user) {
  const { data: profile } = await supabase
    .from('profiles').select('current_workspace_id').eq('id', user.id).single();
  return profile?.current_workspace_id || null;
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

// יצירת איש קשר חדש (ידני) - נכנס ל-workspace הנוכחי של היוצר, אבל יהיה גלוי לכולם
export async function createContact(formData) {
  const { supabase, user } = await requireUser();
  const workspaceId = await currentWorkspaceId(supabase, user);
  if (!workspaceId) return { error: 'לא נמצא workspace פעיל' };

  const first = (formData.get('first') || '').toString().trim();
  if (!first) return { error: 'יש להזין שם פרטי' };

  const insert = { workspace_id: workspaceId, stage: 'open', last_activity_at: new Date().toISOString() };
  for (const field of EDITABLE_FIELDS) {
    if (formData.has(field)) insert[field] = formData.get(field) || null;
  }
  if (formData.has('tags')) insert.tags = parseTags(formData.get('tags'));

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

// ייבוא אנשי קשר בכמות (מקובץ CSV/אקסל) - נכנס ל-workspace הנוכחי
export async function importContacts(rows) {
  const { supabase, user } = await requireUser();
  const workspaceId = await currentWorkspaceId(supabase, user);
  if (!workspaceId) return { error: 'לא נמצא workspace פעיל' };
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'לא נמצאו שורות לייבוא' };

  const now = new Date().toISOString();
  const insert = rows
    .filter((r) => (r.first || '').toString().trim())
    .map((r) => ({
      workspace_id: workspaceId,
      stage: 'open',
      last_activity_at: now,
      first: (r.first || '').toString().trim(),
      last: (r.last || '').toString().trim() || null,
      phone: (r.phone || '').toString().trim() || null,
      phone2: (r.phone2 || '').toString().trim() || null,
      email: (r.email || '').toString().trim() || null,
      dept: (r.dept || '').toString().trim() || null,
      source: (r.source || '').toString().trim() || 'ייבוא אקסל',
      tags: (r.tags || '').toString().split(',').map((t) => t.trim()).filter(Boolean),
    }));

  if (insert.length === 0) return { error: 'אף שורה לא הכילה שם פרטי' };

  const { error } = await supabase.from('contacts').insert(insert);
  if (error) return { error: error.message };

  return { success: true, count: insert.length };
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
