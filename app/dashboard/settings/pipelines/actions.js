'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace, isManagerOfWorkspace } from '../../lib/contactGuards';

async function requireManager(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = workspaceId
    ? await isManagerOfWorkspace(supabase, user.id, workspaceId)
    : await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin של המחלקה יכול לערוך שלבי pipeline' };
  return { supabase };
}

// stage_key לא ניתן לעריכה אחרי יצירה (immutable) - contact_departments.stage
// הוא טקסט חופשי, לא FK, אז שינוי מפתח קיים יתמך אנשי קשר קיימים. ייחודיות
// per-workspace (לא גלובלית) - ר' migration 0036 להסבר המלא.
export async function createStage(workspaceId, { stageKey, label, colorBg, colorFg, isLeadStage, isSideStage }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const key = (stageKey || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const lbl = (label || '').trim();
  if (!key || !lbl) return { error: 'יש להזין מפתח טכני ותווית' };

  let sortOrder = null;
  if (!isSideStage) {
    const { count } = await supabase.from('pipeline_stages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('is_side_stage', false);
    sortOrder = count || 0;
  }

  const { error } = await supabase.from('pipeline_stages').insert({
    workspace_id: workspaceId,
    stage_key: key,
    label: lbl,
    color_bg: colorBg || '#f4f4f5',
    color_fg: colorFg || '#52525b',
    sort_order: sortOrder,
    is_lead_stage: !!isLeadStage,
    is_side_stage: !!isSideStage,
  });
  if (error) return { error: error.code === '23505' ? 'מפתח זה כבר קיים במחלקה זו' : error.message };
  return { success: true };
}

export async function updateStage(id, workspaceId, { label, colorBg, colorFg, isLeadStage }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const lbl = (label || '').trim();
  if (!lbl) return { error: 'יש להזין תווית' };

  const { error } = await ctx.supabase.from('pipeline_stages').update({
    label: lbl, color_bg: colorBg || '#f4f4f5', color_fg: colorFg || '#52525b', is_lead_stage: !!isLeadStage,
  }).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// מנקה את הדגל משורות אחרות של אותה מחלקה - שלב-ניצחון יחיד לכל מחלקה
export async function setWonStage(workspaceId, stageId) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  await supabase.from('pipeline_stages').update({ is_won_stage: false }).eq('workspace_id', workspaceId);
  const { error } = await supabase.from('pipeline_stages').update({ is_won_stage: true }).eq('id', stageId);
  if (error) return { error: error.message };
  return { success: true };
}

// orderedIds - רשימת ה-id של שלבי הרצף הראשי (לא side stages) בסדר החדש
export async function reorderStages(workspaceId, orderedIds) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from('pipeline_stages').update({ sort_order: i }).eq('id', orderedIds[i]);
  }
  return { success: true };
}

// אוטומציה לשלב (migration 0044) - שלב יכול להחזיק לכל היותר אוטומציה
// אחת מכל סוג פעולה (upsert לפי workspace_id+stage_key+action_type)
export async function upsertStageAutomation(workspaceId, stageKey, { actionType, whatsappTemplateId, emailTemplateId, taskTitle, taskDueOffsetDays }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data: existing } = await supabase
    .from('stage_automations').select('id').eq('workspace_id', workspaceId).eq('stage_key', stageKey).eq('action_type', actionType).maybeSingle();

  const payload = {
    workspace_id: workspaceId, stage_key: stageKey, action_type: actionType,
    whatsapp_template_id: actionType === 'send_whatsapp_template' ? (whatsappTemplateId || null) : null,
    email_template_id: actionType === 'send_email_template' ? (emailTemplateId || null) : null,
    task_title: actionType === 'create_task' ? (taskTitle || 'פולו-אפ אוטומטי') : null,
    task_due_offset_days: actionType === 'create_task' ? (taskDueOffsetDays ?? 1) : null,
  };

  const { error } = existing
    ? await supabase.from('stage_automations').update(payload).eq('id', existing.id)
    : await supabase.from('stage_automations').insert(payload);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteStageAutomation(id, workspaceId) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('stage_automations').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// חוסם מחיקה אם יש אנשי קשר בפועל בשלב הזה (contact_departments.stage הוא
// טקסט חופשי, אז זו הבדיקה האפליקטיבית היחידה מפני יתמות)
export async function deleteStage(id, workspaceId, stageKey) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { count } = await supabase.from('contact_departments')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('stage', stageKey);
  if ((count || 0) > 0) return { error: `לא ניתן למחוק - ${count} אנשי קשר נמצאים כרגע בשלב הזה`, contactCount: count };

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// מחיקת שלב "חכמה" - מעבירה קודם את כל אנשי הקשר שבשלב הנמחק לשלב יעד
// חלופי, ורק אז מוחקת. אם ה-update נכשל, לא ממשיכים למחיקה (למנוע יתמות).
export async function reassignStageAndDelete(id, workspaceId, fromStageKey, toStageKey) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  if (!toStageKey || toStageKey === fromStageKey) return { error: 'יש לבחור שלב יעד שונה' };

  const { error: updateError } = await supabase.from('contact_departments')
    .update({ stage: toStageKey })
    .eq('workspace_id', workspaceId).eq('stage', fromStageKey);
  if (updateError) return { error: updateError.message };

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
