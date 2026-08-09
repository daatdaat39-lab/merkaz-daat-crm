'use server';

// אישור/דחייה של אוטומציית שלב שממתינה בתור (pending_automations,
// migration 0056) - ר' applyStageAutomations ב-stageAutomations.js
// ליצירת השורות. הביצוע בפועל (שליחת וואטסאפ/מייל/יצירת משימה) קורה
// אך ורק כאן, ואך ורק אחרי אישור מפורש - אף פעם לא בזמן שינוי השלב עצמו.
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from './contactGuards';
import { getAccessToken } from '../../../lib/gmail/client';
import { sendEmail } from '../../../lib/gmail/send';
import { sendWhatsAppTemplate } from '../../../lib/inforu/whatsapp';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// מי רשאי לאשר/לדחות - הנציג שהאוטומציה נועדה לו, או מנהל/בעלים של
// אותה מחלקה (למקרה שאין נציג משויך, או שהוא לא זמין).
async function requireCanResolve(supabase, user, pending) {
  if (pending.agent_id === user.id) return true;
  return isManagerOfWorkspace(supabase, user.id, pending.workspace_id);
}

// מבצע את הפעולה בפועל, על סמך הנתונים המצולמים ב-pending_automations
// עצמה (לא שולף מחדש טלפון/מייל של איש הקשר - כך שהאישור פועל בדיוק
// על מה שהיה נכון כשהאוטומציה הופעלה). כשל בביצוע לא נבלע בשקט - מוחזר
// כשגיאה לקורא, כדי שהנציג ידע שהאישור לא באמת יצא לפועל.
async function executeAutomation(supabase, pending) {
  if (pending.action_type === 'send_whatsapp_template') {
    if (!pending.contact_phone) return { error: 'לאיש הקשר אין מספר טלפון' };
    const { data: template } = pending.whatsapp_template_id
      ? await supabase.from('whatsapp_templates').select('template_id').eq('id', pending.whatsapp_template_id).single()
      : { data: null };
    await sendWhatsAppTemplate({ phone: pending.contact_phone, firstName: pending.contact_first, reason: 'אוטומציה', templateId: template?.template_id });
    return { success: true };
  }
  if (pending.action_type === 'send_email_template') {
    if (!pending.contact_email || !pending.email_template_id) return { error: 'לאיש הקשר אין מייל, או שאין תבנית מוגדרת' };
    const { data: emailTemplate } = await supabase.from('email_templates').select('subject, body').eq('id', pending.email_template_id).single();
    const { data: connection } = await supabase
      .from('email_connections').select('email_address, refresh_token').eq('workspace_id', pending.workspace_id).eq('purpose', 'send').single();
    if (!emailTemplate || !connection) return { error: 'אין תבנית מייל או חיבור מייל יוצא מוגדר למחלקה' };
    const accessToken = await getAccessToken(connection.refresh_token);
    await sendEmail(accessToken, { from: connection.email_address, to: pending.contact_email, subject: emailTemplate.subject, body: emailTemplate.body });
    return { success: true };
  }
  if (pending.action_type === 'create_task') {
    const dueDate = new Date(Date.now() + (pending.task_due_offset_days ?? 1) * 86400000).toISOString().slice(0, 10);
    const { error } = await supabase.from('tasks').insert({
      workspace_id: pending.workspace_id,
      title: pending.task_title || 'פולו-אפ אוטומטי',
      due_date: dueDate,
      contact_id: pending.contact_id,
      created_by: pending.created_by,
      assigned_to: pending.agent_id || pending.created_by,
    });
    if (error) return { error: error.message };
    return { success: true };
  }
  return { error: 'סוג אוטומציה לא מוכר' };
}

export async function approvePendingAutomation(id) {
  const { supabase, user } = await requireUser();
  const { data: pending } = await supabase.from('pending_automations').select('*').eq('id', id).single();
  if (!pending) return { error: 'האוטומציה לא נמצאה' };
  if (pending.status !== 'pending') return { error: 'האוטומציה הזו כבר טופלה' };
  const allowed = await requireCanResolve(supabase, user, pending);
  if (!allowed) return { error: 'אין לך הרשאה לאשר אוטומציה זו' };

  const result = await executeAutomation(supabase, pending);
  if (result.error) return result;

  await supabase.from('pending_automations')
    .update({ status: 'approved', resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', id);
  return { success: true };
}

export async function rejectPendingAutomation(id) {
  const { supabase, user } = await requireUser();
  const { data: pending } = await supabase.from('pending_automations').select('workspace_id, agent_id, status').eq('id', id).single();
  if (!pending) return { error: 'האוטומציה לא נמצאה' };
  if (pending.status !== 'pending') return { error: 'האוטומציה הזו כבר טופלה' };
  const allowed = await requireCanResolve(supabase, user, pending);
  if (!allowed) return { error: 'אין לך הרשאה לדחות אוטומציה זו' };

  const { error } = await supabase.from('pending_automations')
    .update({ status: 'rejected', resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// כל האוטומציות שממתינות לנציג הנוכחי - משמש גם את ההודעה הצפה (בזמן
// טעינת העמוד, למקרה שהצטברו כאלה בזמן שהוא לא היה מחובר) וגם את מסך
// "בקשות אישור".
export async function fetchMyPendingAutomations() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from('pending_automations')
    .select(`
      id, workspace_id, stage_label, action_type, task_title, contact_first, contact_last, created_at,
      workspaces:workspace_id (name),
      whatsapp_templates:whatsapp_template_id (name),
      email_templates:email_template_id (name)
    `)
    .eq('agent_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return data || [];
}
