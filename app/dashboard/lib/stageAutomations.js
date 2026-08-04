// מפעיל אוטומציות שהוגדרו לשלב מסוים (settings/pipelines, migration
// 0044) - נקרא מיד אחרי כתיבה מוצלחת של stage חדש ל-contact_departments
// (לא לפני - אם הכתיבה נכשלה, לא שולחים כלום). כל אוטומציה עטופה
// ב-try/catch נפרד כדי שכשל בשליחה אחת (למשל תיבת מייל לא מחוברת) לא
// יעצור אוטומציות אחרות ולא יכשיל את פעולת שינוי השלב המקורית - אותו
// דפוס בדיוק כמו maybeCreateZoomLink בפגישות.
import { getAccessToken } from '../../../lib/gmail/client';
import { sendEmail } from '../../../lib/gmail/send';
import { sendWhatsAppTemplate } from '../../../lib/inforu/whatsapp';

export async function applyStageAutomations(supabase, { workspaceId, stageKey, contactId, userId }) {
  if (!workspaceId || !stageKey || !contactId) return;

  const { data: automations } = await supabase
    .from('stage_automations')
    .select('id, action_type, whatsapp_template_id, email_template_id, task_title, task_due_offset_days')
    .eq('workspace_id', workspaceId)
    .eq('stage_key', stageKey);
  if (!automations || automations.length === 0) return;

  const { data: contact } = await supabase.from('contacts').select('first, last, phone, email').eq('id', contactId).single();
  if (!contact) return;

  for (const automation of automations) {
    try {
      if (automation.action_type === 'send_whatsapp_template' && contact.phone) {
        const { data: template } = automation.whatsapp_template_id
          ? await supabase.from('whatsapp_templates').select('template_id').eq('id', automation.whatsapp_template_id).single()
          : { data: null };
        await sendWhatsAppTemplate({ phone: contact.phone, firstName: contact.first, reason: 'אוטומציה', templateId: template?.template_id });
      } else if (automation.action_type === 'send_email_template' && contact.email && automation.email_template_id) {
        const { data: emailTemplate } = await supabase.from('email_templates').select('subject, body').eq('id', automation.email_template_id).single();
        const { data: connection } = await supabase
          .from('email_connections').select('email_address, refresh_token').eq('workspace_id', workspaceId).eq('purpose', 'send').single();
        if (emailTemplate && connection) {
          const accessToken = await getAccessToken(connection.refresh_token);
          await sendEmail(accessToken, { from: connection.email_address, to: contact.email, subject: emailTemplate.subject, body: emailTemplate.body });
        }
      } else if (automation.action_type === 'create_task') {
        const dueDate = new Date(Date.now() + (automation.task_due_offset_days ?? 1) * 86400000).toISOString().slice(0, 10);
        await supabase.from('tasks').insert({
          workspace_id: workspaceId,
          title: automation.task_title || 'פולו-אפ אוטומטי',
          due_date: dueDate,
          contact_id: contactId,
          created_by: userId,
          assigned_to: userId,
        });
      }
    } catch {
      // כשל שליחה בודד לא עוצר אוטומציות אחרות ולא מכשיל את שינוי השלב
    }
  }
}
