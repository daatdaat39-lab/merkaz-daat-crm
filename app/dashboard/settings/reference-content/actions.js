'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { suggestRuleProposals } from '../../../../lib/ai/suggestRuleProposals';

const UNMATCHED_EVENTS_BATCH_CAP = 200;

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
  if (changes.approved !== undefined) update.approved = !!changes.approved;
  if (changes.rejected !== undefined) update.rejected = !!changes.rejected;
  update.updated_at = new Date().toISOString();
  const { error } = await ctx.supabase.from('reference_content').update(update).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// מנתח אירועי "לא נמצא כלל מתאים" שהצטברו (ai_unmatched_events, ר'
// app/dashboard/lib/aiActionChip.js) ומציע כללים-מועמדים חדשים - כפתור-
// ידני בלבד (בלי cron, כמו כל שאר הרענונים-הידניים בפרויקט). כל הצעה
// נכנסת ל-reference_content עם kind='rule', auto_suggested=true,
// approved=false - לא משפיעה על ה-AI החי (fetchActiveRules מסנן approved=true)
// עד שמנהל מאשר אותה במפורש.
export async function analyzeRuleProposals() {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data: events } = await supabase
    .from('ai_unmatched_events')
    .select('course_id, action_text')
    .order('created_at', { ascending: false })
    .limit(UNMATCHED_EVENTS_BATCH_CAP);
  if (!events || events.length === 0) return { success: true, proposed: 0, message: 'אין עדיין מספיק נתונים לניתוח' };

  const courseIds = Array.from(new Set(events.map((e) => e.course_id).filter(Boolean)));
  const { data: courseRows } = courseIds.length
    ? await supabase.from('courses').select('id, name').in('id', courseIds)
    : { data: [] };
  const courseNameById = Object.fromEntries((courseRows || []).map((c) => [c.id, c.name]));

  const { data: rejectedRows } = await supabase
    .from('reference_content')
    .select('trigger_condition')
    .eq('kind', 'rule').eq('rejected', true);
  const excludeTriggerConditions = (rejectedRows || []).map((r) => r.trigger_condition).filter(Boolean);

  let proposals;
  try {
    proposals = await suggestRuleProposals({
      events: events.map((e) => ({ courseId: e.course_id, actionText: e.action_text })),
      courseNameById,
      excludeTriggerConditions,
    });
  } catch (e) {
    return { error: e?.message || 'ניתוח-הכללים נכשל' };
  }
  if (!proposals.length) return { success: true, proposed: 0, message: 'לא נמצאה תבנית חוזרת חדשה' };

  const { count } = await supabase.from('reference_content').select('id', { count: 'exact', head: true }).eq('kind', 'rule');
  const rows = proposals.map((p, i) => ({
    kind: 'rule', course_id: p.courseId, title: p.title, body: null,
    trigger_condition: p.triggerCondition, suggested_action: p.suggestedAction,
    sort_order: (count || 0) + i, auto_suggested: true, approved: false,
  }));
  const { error } = await supabase.from('reference_content').insert(rows);
  if (error) return { error: error.message };
  return { success: true, proposed: rows.length };
}

export async function removeReferenceContent(id) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('reference_content').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
