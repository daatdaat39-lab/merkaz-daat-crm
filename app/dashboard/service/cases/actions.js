'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../lib/contactGuards';
import { computeSlaDueAt, SEVERITY_SLA_HOURS } from '../../lib/serviceSla';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function createCase({ contactId, workspaceId, courseId, subject, severity }) {
  const { supabase, user } = await requireUser();
  const allowed = await isMemberOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'אין לך גישה למחלקה הזו' };
  if (!contactId) return { error: 'יש לבחור איש קשר' };
  if (!subject?.trim()) return { error: 'יש למלא נושא לקריאה' };

  const { data, error } = await supabase.from('service_cases').insert({
    contact_id: contactId, workspace_id: workspaceId, course_id: courseId || null,
    subject: subject.trim(), severity: severity || 'medium',
    sla_due_at: computeSlaDueAt(severity || 'medium'),
  }).select('id').single();
  if (error) return { error: error.message };
  return { success: true, caseId: data.id };
}

async function requireCaseAccess(supabase, userId, caseId) {
  const { data: row } = await supabase.from('service_cases').select('id, workspace_id, created_at').eq('id', caseId).maybeSingle();
  if (!row) return { error: 'הקריאה לא נמצאה' };
  const allowed = await isMemberOfWorkspace(supabase, userId, row.workspace_id);
  if (!allowed) return { error: 'אין לך גישה לקריאה הזו' };
  return { row };
}

export async function updateCaseStatus(caseId, status, closedReason) {
  const { supabase, user } = await requireUser();
  const { error } = await requireCaseAccess(supabase, user.id, caseId);
  if (error) return { error };
  const update = { status, closed_reason: status === 'closed' ? (closedReason || null) : null };
  if (status === 'closed') update.closed_at = new Date().toISOString();
  if (status !== 'closed') update.closed_at = null;
  const { error: updateError } = await supabase.from('service_cases').update(update).eq('id', caseId);
  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function updateCaseSeverity(caseId, severity) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireCaseAccess(supabase, user.id, caseId);
  if (error) return { error };
  // ה-SLA מחושב מחדש מ-created_at (לא מעכשיו) - שינוי חומרה לא "מאפס"
  // את השעון, רק מתאים את החלון הכולל לחומרה החדשה.
  const hours = SEVERITY_SLA_HOURS[severity] ?? SEVERITY_SLA_HOURS.medium;
  const slaDueAt = new Date(new Date(row.created_at).getTime() + hours * 3600000).toISOString();
  const { error: updateError } = await supabase.from('service_cases').update({ severity, sla_due_at: slaDueAt }).eq('id', caseId);
  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function assignCaseAgent(caseId, agentId) {
  const { supabase, user } = await requireUser();
  const { error } = await requireCaseAccess(supabase, user.id, caseId);
  if (error) return { error };
  const { error: updateError } = await supabase.from('service_cases').update({ assigned_to: agentId || null }).eq('id', caseId);
  if (updateError) return { error: updateError.message };
  return { success: true };
}

// הערה/סיכום-שיחה על קריאת-שירות - נשמרת כפריט נפרד ב-service_case_notes
// (לא lead_inquiries - שייכת למחלקה, לא לקריאה), מוצגת בציר-הזמן של המסך.
export async function addCaseNote(caseId, note) {
  const { supabase, user } = await requireUser();
  const text = (note || '').trim();
  if (!text) return { error: 'יש למלא סיכום שיחה' };
  const { error } = await requireCaseAccess(supabase, user.id, caseId);
  if (error) return { error };
  const { error: insertError } = await supabase.from('service_case_notes').insert({ case_id: caseId, note: text, created_by: user.id });
  if (insertError) return { error: insertError.message };
  return { success: true };
}
