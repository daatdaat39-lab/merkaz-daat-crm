'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import { getPipeline } from '../../lib/pipelines';
import { suggestManagerInsights } from '../../../../lib/ai/suggestManagerInsights';
import { upsertStageAutomation } from '../pipelines/actions';

const STALE_DAYS = 7;

async function requireManager(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'רק owner/admin של המחלקה יכול לצפות בתובנות' };
  return { supabase };
}

// אוסף מדדים אמיתיים מה-DB (לא נתונים גולמיים חופשיים) ומעביר ל-AI רק
// אותם - ר' lib/ai/suggestManagerInsights.js לעקרון הבטיחות המלא.
export async function analyzeManagerInsights(workspaceId, workspaceName) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const pipeline = await getPipeline(supabase, workspaceName);
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();

  const [{ data: staleRows }, { data: closeReasonRows }, { data: existingAutomations }] = await Promise.all([
    supabase.from('contact_departments').select('stage').eq('workspace_id', workspaceId).lt('last_activity_at', staleCutoff),
    supabase.from('contact_departments').select('closed_reason').eq('workspace_id', workspaceId).eq('stage', 'closed').not('closed_reason', 'is', null),
    supabase.from('stage_automations').select('stage_key').eq('workspace_id', workspaceId),
  ]);

  const staleCountByStage = {};
  for (const r of staleRows || []) staleCountByStage[r.stage] = (staleCountByStage[r.stage] || 0) + 1;
  const staleByStage = Object.entries(staleCountByStage)
    .map(([stageKey, count]) => ({ stageKey, label: pipeline.labels[stageKey] || stageKey, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const reasonCounts = {};
  for (const r of closeReasonRows || []) { if (r.closed_reason) reasonCounts[r.closed_reason] = (reasonCounts[r.closed_reason] || 0) + 1; }
  const topCloseReasons = Object.entries(reasonCounts).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 3);

  const automatedStageKeys = new Set((existingAutomations || []).map((a) => a.stage_key));
  const { data: stageContactCounts } = await supabase.from('contact_departments').select('stage').eq('workspace_id', workspaceId);
  const contactCountByStage = {};
  for (const r of stageContactCounts || []) contactCountByStage[r.stage] = (contactCountByStage[r.stage] || 0) + 1;
  const stagesWithoutAutomation = pipeline.order
    .filter((stageKey) => !automatedStageKeys.has(stageKey) && (contactCountByStage[stageKey] || 0) >= 2)
    .map((stageKey) => ({ stageKey, label: pipeline.labels[stageKey] || stageKey, count: contactCountByStage[stageKey] || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const metrics = { workspaceName, staleByStage, topCloseReasons, stagesWithoutAutomation };

  try {
    const suggestions = await suggestManagerInsights(metrics);
    return { success: true, suggestions, metrics };
  } catch (err) {
    return { error: err.message };
  }
}

// "החלה" - ממופה תמיד לפעולה צרה ומוכרת (הוספת אוטומציית תזכורת-פולו-אפ
// לשלב), לעולם לא הרצת טקסט חופשי מה-AI
export async function applySuggestedAutomation(workspaceId, stageKey, title) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  return upsertStageAutomation(workspaceId, stageKey, {
    actionType: 'create_task',
    taskTitle: title || 'פולו-אפ מומלץ',
    taskDueOffsetDays: 1,
  });
}
