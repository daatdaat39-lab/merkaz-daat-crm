'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';

async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin יכול לערוך תוכן-עזר' };
  return { supabase };
}

export async function addReferenceContent({ kind, courseId, tag, title, body }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  if (!title?.trim() || !body?.trim()) return { error: 'יש למלא כותרת ותוכן' };

  const { count } = await supabase.from('reference_content').select('id', { count: 'exact', head: true }).eq('kind', kind);
  const { error } = await supabase.from('reference_content').insert({
    kind, course_id: courseId || null, tag: (tag || '').trim() || null,
    title: title.trim(), body: body.trim(), sort_order: count || 0,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateReferenceContent(id, changes) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const update = {};
  if (changes.title !== undefined) update.title = changes.title;
  if (changes.body !== undefined) update.body = changes.body;
  if (changes.courseId !== undefined) update.course_id = changes.courseId || null;
  if (changes.tag !== undefined) update.tag = (changes.tag || '').trim() || null;
  if (changes.isActive !== undefined) update.is_active = !!changes.isActive;
  update.updated_at = new Date().toISOString();
  const { error } = await ctx.supabase.from('reference_content').update(update).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeReferenceContent(id) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('reference_content').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
