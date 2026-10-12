'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { applyStageAutomations } from '../../../lib/stageAutomations';
import { getPipeline } from '../../../lib/pipelines';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireMemberOfLead(supabase, userId, departmentId) {
  const { data: row } = await supabase.from('contact_departments').select('id, contact_id, workspace_id, extra_fields, stage, workspaces:workspace_id (name)').eq('id', departmentId).maybeSingle();
  if (!row) return { error: 'הליד לא נמצא' };
  const allowed = await isMemberOfWorkspace(supabase, userId, row.workspace_id);
  if (!allowed) return { error: 'אין לך גישה לליד הזה' };
  return { row };
}

// נעילה (migration 0148) - staleness 15 דקות, זהה לתור-השיחות (ר' lock_lead).
// self-reclaim תמיד מצליח (אם locked_by הוא כבר אני) - אותו עיקרון שכבר
// נלמד ב-claim_specific_campaign_contact.
export async function lockLead(departmentId) {
  const { supabase, user } = await requireUser();
  const { error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const { data, error: rpcError } = await supabase.rpc('lock_lead', { p_department_id: departmentId, p_caller: user.id });
  if (rpcError) return { error: rpcError.message };
  return { success: true, locked: !!data };
}

// פעימת-חיים כל 5 דקות - נקרא מהלקוח כל עוד המסך פתוח בפועל (לא
// confirming/סגור), אותו דפוס בדיוק כמו heartbeatClaim בתור-השיחות.
export async function heartbeatLeadLock(departmentId) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc('heartbeat_lead_lock', { p_department_id: departmentId, p_caller: user.id });
  if (error) return { error: error.message };
  return { success: true, stillLocked: !!data };
}

// שחרור - רק ב-beforeunload אמיתי (לא visibilitychange), ר' ההערה
// המתועדת ב-ActiveCallPanel.js על אותה סכנה בדיוק.
export async function releaseLeadLock(departmentId) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc('release_lead_lock', { p_department_id: departmentId, p_caller: user.id });
  if (error) return { error: error.message };
  return { success: true };
}

// כפתור "המרה": קריאה אחת ל-RPC אטומי (migration 0150) - מעדכן את השלב
// לשלב-הניצחון ויוצר שורת course_purchases יחד, לא שתי כתיבות נפרדות.
export async function convertLead(departmentId, { price } = {}) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };

  const courseId = row.extra_fields?.course_id;
  if (!courseId) return { error: 'יש לבחור קורס לפני ההמרה' };

  const workspaceName = row.workspaces?.name;
  const pipeline = await getPipeline(supabase, workspaceName);
  if (!pipeline.wonStage) return { error: 'לא הוגדר שלב-ניצחון למחלקה הזו' };

  const { data: purchaseId, error: rpcError } = await supabase.rpc('convert_lead_to_purchase', {
    p_department_id: departmentId, p_course_id: courseId,
    p_price: price ? Number(price) : null, p_caller: user.id, p_won_stage: pipeline.wonStage,
  });
  if (rpcError) return { error: rpcError.message };

  await applyStageAutomations(supabase, {
    workspaceId: row.workspace_id, stageKey: pipeline.wonStage, contactId: row.contact_id,
    userId: user.id, contactDepartmentId: departmentId,
  });

  return { success: true, purchaseId };
}
