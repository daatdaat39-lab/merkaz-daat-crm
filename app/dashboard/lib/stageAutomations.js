// אוטומציות שהוגדרו לשלב מסוים (settings/pipelines, migration 0044) -
// נקרא מיד אחרי כתיבה מוצלחת של stage חדש ל-contact_departments (לא
// לפני - אם הכתיבה נכשלה, לא נכנס כלום לתור). החל מ-migration 0056,
// אוטומציה לעולם לא מתבצעת ישירות כאן - כל אוטומציה מייצרת שורת
// pending_automations שממתינה לאישור מפורש של הנציג המשויך
// (pendingAutomationActions.js). פרטי איש הקשר מצולמים כאן, בזמן
// היצירה - כדי שהאישור המאוחר יפעל על מה שהיה נכון ברגע שהאוטומציה
// הופעלה, גם אם הטלפון/מייל השתנו בינתיים.
import { getPipeline } from './pipelines';

export async function applyStageAutomations(supabase, { workspaceId, stageKey, contactId, userId, contactDepartmentId }) {
  if (!workspaceId || !stageKey || !contactId) return;

  const { data: automations } = await supabase
    .from('stage_automations')
    .select('id, action_type, whatsapp_template_id, email_template_id, task_title, task_due_offset_days')
    .eq('workspace_id', workspaceId)
    .eq('stage_key', stageKey);
  if (!automations || automations.length === 0) return;

  const { data: contact } = await supabase.from('contacts').select('first, last, phone, email').eq('id', contactId).single();
  if (!contact) return;

  let agentId = null;
  if (contactDepartmentId) {
    const { data: dept } = await supabase.from('contact_departments').select('agent_id').eq('id', contactDepartmentId).single();
    agentId = dept?.agent_id || null;
  }

  const { data: workspace } = await supabase.from('workspaces').select('name').eq('id', workspaceId).single();
  const pipeline = workspace ? await getPipeline(supabase, workspace.name) : null;
  const stageLabel = pipeline?.labels?.[stageKey] || stageKey;

  const rows = automations.map((a) => ({
    workspace_id: workspaceId,
    contact_id: contactId,
    contact_department_id: contactDepartmentId || null,
    agent_id: agentId,
    stage_key: stageKey,
    stage_label: stageLabel,
    action_type: a.action_type,
    whatsapp_template_id: a.whatsapp_template_id,
    email_template_id: a.email_template_id,
    task_title: a.task_title,
    task_due_offset_days: a.task_due_offset_days,
    contact_first: contact.first,
    contact_last: contact.last,
    contact_phone: contact.phone,
    contact_email: contact.email,
    created_by: userId,
  }));

  await supabase.from('pending_automations').insert(rows);
}
