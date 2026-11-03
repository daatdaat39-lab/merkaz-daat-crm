'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';

// פעולות-הצ'קליסט בשלב "פרטים טכניים" (מסלול-הצלחה-מורחב, migration 0174) -
// שלב-ביניים-תיעודי לפני ה-RPC convert_lead_to_purchase הקיים (לא-נוגעים-
// בו). כל-הפעולות עושות upsert חלקי על contact_department_id (unique) -
// שולחות-רק-את-השדות-שהשתנו, כדי-שלא-לדרוס-שדות-אחרים-שכבר-מולאו.

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireMemberOfLead(supabase, userId, departmentId) {
  const { data: row } = await supabase.from('contact_departments').select('id, workspace_id').eq('id', departmentId).maybeSingle();
  if (!row) return { error: 'הליד לא נמצא' };
  const allowed = await isMemberOfWorkspace(supabase, userId, row.workspace_id);
  if (!allowed) return { error: 'אין לך גישה לליד הזה' };
  return { row };
}

async function upsertChecklist(supabase, departmentId, workspaceId, userId, patch) {
  const { error } = await supabase.from('lead_conversion_checklist').upsert(
    {
      contact_department_id: departmentId,
      workspace_id: workspaceId,
      updated_at: new Date().toISOString(),
      updated_by: userId,
      ...patch,
    },
    { onConflict: 'contact_department_id' }
  );
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateLeadTrack(departmentId, trackId) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, { track_id: trackId || null });
}

export async function updateLeadForms(departmentId, { link, done }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const patch = {};
  if (link !== undefined) patch.forms_link = link || null;
  if (done !== undefined) {
    patch.forms_done = !!done;
    patch.forms_done_at = done ? new Date().toISOString() : null;
  }
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}

export async function updateLeadPayment(departmentId, { totalAmount, installmentsCount, method, note, arranged }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const patch = {};
  if (totalAmount !== undefined) patch.payment_total_amount = totalAmount === '' || totalAmount === null ? null : Number(totalAmount);
  if (installmentsCount !== undefined) patch.payment_installments_count = installmentsCount === '' || installmentsCount === null ? null : Number(installmentsCount);
  if (method !== undefined) patch.payment_method = method || null;
  if (note !== undefined) patch.payment_note = note || null;
  if (arranged !== undefined) {
    patch.payment_arranged = !!arranged;
    patch.payment_arranged_at = arranged ? new Date().toISOString() : null;
  }
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}

export async function updateLeadSignatures(departmentId, { done, note }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const patch = {};
  if (note !== undefined) patch.signatures_note = note || null;
  if (done !== undefined) {
    patch.signatures_done = !!done;
    patch.signatures_done_at = done ? new Date().toISOString() : null;
  }
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}
