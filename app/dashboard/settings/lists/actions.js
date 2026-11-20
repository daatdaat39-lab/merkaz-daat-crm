'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';

// "בניית רשימה" - owner/admin בלבד (סינון חוצה-מחלקות וייצוא-המוני, כמו
// ייבוא/ייצוא-נתונים ב-settings/import).
async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin יכול להשתמש בבניית-רשימות' };
  return { supabase, user };
}

export async function searchContactListCandidates(params = {}) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc('find_contact_list_candidates', {
    p_source: params.source || null,
    p_stage_workspace_id: params.stageWorkspaceId || null,
    p_stages: Array.isArray(params.stages) && params.stages.length ? params.stages : null,
    p_course_id: params.courseId || null,
    p_has_course_enrollment: params.hasCourseEnrollment ?? null,
    p_sort_by: params.sortBy || 'name',
    p_sort_dir: params.sortDir || 'asc',
    p_limit: params.limit || 200,
    p_offset: params.offset || 0,
  });
  if (error) return { error: error.message };
  return { success: true, rows: data || [], total: data?.[0]?.total_row_count || 0 };
}

// שמות-רשימות-קיימים (למילוי-אוטומטי בתיבת "שם הרשימה") - distinct בצד-
// לקוח, כי הטבלה קטנה-ביחס (לא נתח-כל-6,500-אנשי-קשר).
export async function getExistingListTitles() {
  const ctx = await requireManager();
  if (ctx.error) return [];
  const { data } = await ctx.supabase
    .from('contact_list_entries')
    .select('list_title')
    .order('created_at', { ascending: false })
    .limit(2000);
  return Array.from(new Set((data || []).map((r) => r.list_title))).slice(0, 200);
}

// רישום-בהיסטוריה - שורה-אחת-לכל-איש-קשר, בכוונה-בלי upsert/dedupe (כניסה
// כפולה לאותה-רשימה = שתי-שורות-נפרדות, לפי החלטה מפורשת).
export async function recordContactListEntries(contactIds, listTitle) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase, user } = ctx;

  const title = (listTitle || '').trim();
  if (!title) return { error: 'יש להזין שם לרשימה' };
  if (!Array.isArray(contactIds) || contactIds.length === 0) return { error: 'לא נבחרו אנשי קשר' };

  const { error } = await supabase.from('contact_list_entries').insert(
    contactIds.map((contactId) => ({ contact_id: contactId, list_title: title, created_by: user.id })),
  );
  if (error) return { error: error.message };
  return { success: true, count: contactIds.length };
}

// מסך "כל הרשימות" - קיבוץ-לפי-שם (ספירה + תאריך-אחרון), לא-ניתן-לעשות
// GROUP BY/HAVING דרך query-builder רגיל בלי RPC - נשלף-גולמי ומקובץ בצד-
// שרת (הטבלה קטנה, לא 6,500+ שורות).
export async function getAllListSummaries() {
  const ctx = await requireManager();
  if (ctx.error) return [];
  const { data } = await ctx.supabase
    .from('contact_list_entries')
    .select('list_title, created_at')
    .order('created_at', { ascending: false });
  const byTitle = new Map();
  for (const row of data || []) {
    const existing = byTitle.get(row.list_title);
    if (!existing) byTitle.set(row.list_title, { title: row.list_title, count: 1, lastAt: row.created_at });
    else { existing.count += 1; if (row.created_at > existing.lastAt) existing.lastAt = row.created_at; }
  }
  return Array.from(byTitle.values()).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

export async function getListMembers(listTitle) {
  const ctx = await requireManager();
  if (ctx.error) return [];
  const { data } = await ctx.supabase
    .from('contact_list_entries')
    .select('id, created_at, contacts:contact_id (id, first, last, phone, email)')
    .eq('list_title', listTitle)
    .order('created_at', { ascending: false });
  return data || [];
}
