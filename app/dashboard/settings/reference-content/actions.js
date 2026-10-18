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

export async function addReferenceContent({ kind, courseId, tag, title, body, triggerCondition, suggestedAction }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  if (kind === 'rule') {
    if (!title?.trim() || !triggerCondition?.trim() || !suggestedAction?.trim()) return { error: 'יש למלא שם-כלל, תנאי ופעולה' };
  } else if (!title?.trim() || !body?.trim()) {
    return { error: 'יש למלא כותרת ותוכן' };
  }

  const { count } = await supabase.from('reference_content').select('id', { count: 'exact', head: true }).eq('kind', kind);
  const { error } = await supabase.from('reference_content').insert({
    kind, course_id: courseId || null, tag: (tag || '').trim() || null,
    title: title.trim(), body: (body || '').trim() || null, sort_order: count || 0,
    trigger_condition: kind === 'rule' ? triggerCondition.trim() : null,
    suggested_action: kind === 'rule' ? suggestedAction.trim() : null,
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
  if (changes.triggerCondition !== undefined) update.trigger_condition = changes.triggerCondition;
  if (changes.suggestedAction !== undefined) update.suggested_action = changes.suggestedAction;
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
