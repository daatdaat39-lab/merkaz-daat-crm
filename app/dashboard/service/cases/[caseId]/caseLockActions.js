'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireCaseMember(supabase, userId, caseId) {
  const { data: row } = await supabase.from('service_cases').select('id, workspace_id').eq('id', caseId).maybeSingle();
  if (!row) return { error: 'הקריאה לא נמצאה' };
  const allowed = await isMemberOfWorkspace(supabase, userId, row.workspace_id);
  if (!allowed) return { error: 'אין לך גישה לקריאה הזו' };
  return { row };
}

// נעילה (migration 0151) - נפרדת מ-lock_lead (שלב 3): חיה ישירות על
// service_cases.id, לא על contact_departments - אותו caller יכול להחזיק
// נעילת-ליד ונעילת-קריאת-שירות על אותו איש-קשר בו-זמנית בלי התנגשות.
export async function lockCase(caseId) {
  const { supabase, user } = await requireUser();
  const { error } = await requireCaseMember(supabase, user.id, caseId);
  if (error) return { error };
  const { data, error: rpcError } = await supabase.rpc('lock_service_case', { p_case_id: caseId, p_caller: user.id });
  if (rpcError) return { error: rpcError.message };
  return { success: true, locked: !!data };
}

export async function heartbeatCaseLock(caseId) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc('heartbeat_service_case_lock', { p_case_id: caseId, p_caller: user.id });
  if (error) return { error: error.message };
  return { success: true, stillLocked: !!data };
}

export async function releaseCaseLock(caseId) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc('release_service_case_lock', { p_case_id: caseId, p_caller: user.id });
  if (error) return { error: error.message };
  return { success: true };
}
