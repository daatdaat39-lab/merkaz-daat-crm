'use server';

import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { groupTagsByDepartment } from '../../lib/tagGroups';
import { getPicklistValues } from '../../lib/picklists';
import { getAllPipelines } from '../../lib/pipelines';
import { getCampaignStages } from '../../lib/campaignStages';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getAllExtraFields } from '../../lib/extraFields';

// טוען את כל הנתונים של כרטיס איש קשר - מופרד מ-ContactDetailContent.js
// כדי שאותה לוגיקה תהיה קריאה גם משם (עמוד/מודל רגיל, ניתוב של Next)
// וגם מ-FloatingContactCard.js (חלון צף, נטען דרך קריאת לקוח ל-server action).
export async function loadContactCardData(contactId) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirectToLogin: true };

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();

  if (!contact) return { notFound: true };

  const [{ data: departmentRows }, { data: allWorkspaces }, { data: meetings }, { data: tasks }, { data: tagRows }, { data: viewerMemberships }, { data: sentEmailRows }, { data: emailConnections }, { data: sentWhatsappRows }, { data: whatsappTemplates }, { data: emailTemplates }, { data: donationTransactionRows }, { data: dedicationMembershipRows }, { data: callHistoryRows }, { data: externalIdRows }, { data: phoneCallRows }, { data: campaignProcessRows }, { data: commitmentRows }] = await Promise.all([
    supabase
      .from('contact_departments')
      .select('id, stage, closed_reason, workspace_id, agent_id, last_activity_at, extra_fields, created_by_manager, workspaces:workspace_id (name), lead_inquiries (reason, note, created_at)')
      .eq('contact_id', contact.id),
    supabase.from('workspaces').select('id, name').order('name'),
    supabase
      .from('meetings')
      .select('id, title, meeting_date, meeting_time, type, location, notes, workspace_id, zoom_join_url')
      .eq('contact_id', contact.id)
      .order('meeting_date', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, due_date, done, workspace_id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false }),
    supabase.from('contacts').select('tags, contact_departments (workspaces:workspace_id (name))'),
    supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id),
    supabase
      .from('sent_emails')
      .select('id, workspace_id, from_address, subject, body, sent_at')
      .eq('contact_id', contact.id)
      .order('sent_at', { ascending: false }),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase
      .from('sent_whatsapp')
      .select('id, workspace_id, phone, reason, kind, message, direction, sent_at')
      .eq('contact_id', contact.id)
      .order('sent_at', { ascending: false }),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
    supabase
      .from('donation_transactions')
      .select('id, workspace_id, source_system, amount, transaction_date, commitment_id')
      .eq('contact_id', contact.id)
      .order('transaction_date', { ascending: false }),
    supabase
      .from('campaign_contacts')
      .select('id, campaign_id, campaigns:campaign_id!inner (kind), campaign_dedication_entries (id, dedication_date, dedication_text, note, names, locked_at)')
      .eq('contact_id', contact.id)
      .eq('campaigns.kind', 'dedication'),
    supabase
      .from('contact_call_history')
      .select('id, call_date, response_text, source_system')
      .eq('contact_id', contact.id)
      .order('call_date', { ascending: false }),
    supabase
      .from('contact_external_ids')
      .select('id, source_system, external_id')
      .eq('contact_id', contact.id)
      .order('source_system'),
    supabase
      .from('phone_calls')
      .select('id, direction, snumber, dnumber, extension, status, answered, duration_seconds, recording_url, started_at')
      .eq('contact_id', contact.id)
      .order('started_at', { ascending: false }),
    supabase
      .from('campaign_contacts')
      .select('id, campaign_id, status, assigned_to, campaigns:campaign_id!inner (id, name, workspace_id, kind)')
      .eq('contact_id', contact.id)
      .neq('campaigns.kind', 'dedication'),
    supabase
      .from('commitments')
      .select('id, workspace_id, total_amount, installments_count, status, note, created_at')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false }),
  ]);

  // "שולם/נותר" לכל התחייבות - מחושב כאן מהתנועות שכבר נטענו למעלה
  // (donationTransactionRows), בלי שאילתה נוספת - אותו עיקרון בדיוק כמו
  // הסכומים שהקוביה הגנרית מחשבת מהתנועות שהיא מקבלת כ-props.
  const commitments = (commitmentRows || []).map((c) => ({
    ...c,
    payments: (donationTransactionRows || []).filter((t) => t.commitment_id === c.id),
  }));

  const closeReasonRows = await getPicklistValues(supabase, 'close_reason', null);
  const closeReasons = closeReasonRows.length ? closeReasonRows.map((r) => r.value) : undefined;
  const isManager = await isManagerOfAnyWorkspace(supabase, user.id);
  const { byWorkspace: pipelinesByWorkspace } = await getAllPipelines(supabase);

  // שדות מותאמים אישית: מה הצופה הנוכחי (לא איש הקשר!) בחר להסתיר לעצמו
  // בכל מחלקה - העדפה פרטית, לא משפיעה על מה שנציגים אחרים רואים באותו
  // כרטיס. ר' app/dashboard/lib/fieldPreferences.js.
  const { data: viewerProfile } = await supabase
    .from('profiles').select('hidden_extra_fields, hidden_widgets').eq('id', user.id).single();
  const hiddenExtraFieldsByWorkspace = viewerProfile?.hidden_extra_fields || {};
  const hiddenWidgetsByWorkspace = viewerProfile?.hidden_widgets || {};
  const extraFieldDefsByWorkspaceName = await getAllExtraFields(supabase);

  // חברות בקמפיין ההקדשות (אם יש) - נקודת האמת היחידה ל"זכאי ליום בלוח
  // שנה" מאז שהתגית "לוח שנה" הוחלפה לגמרי בחברות-קמפיין (ר' PR4 בתוכנית
  // הארכיטקטורה). ר' campaign_contacts:campaign_id!inner (kind) בשאילתה
  // למעלה - מסנן כבר בשרת רק חברות בקמפיין מסוג 'dedication'.
  const dedicationMembership = (dedicationMembershipRows || [])[0] || null;
  const dedications = [...(dedicationMembership?.campaign_dedication_entries || [])]
    .sort((a, b) => new Date(a.dedication_date) - new Date(b.dedication_date));
  const dedicationCampaignId = dedicationMembership?.campaign_id || null;

  const admin = createAdminClient();
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));

  const agentIds = Array.from(new Set((departmentRows || []).map((r) => r.agent_id).filter(Boolean)));
  const { data: agentProfiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const agentNameById = Object.fromEntries((agentProfiles || []).map((p) => [p.id, p.name || emailById[p.id] || 'משתמש']));

  const workspaceIds = Array.from(new Set((departmentRows || []).map((r) => r.workspace_id)));
  const { data: memberRows } = workspaceIds.length
    ? await supabase.from('workspace_members').select('workspace_id, user_id').in('workspace_id', workspaceIds)
    : { data: [] };
  const memberIds = Array.from(new Set((memberRows || []).map((m) => m.user_id)));
  const { data: memberProfiles } = memberIds.length
    ? await supabase.from('profiles').select('id, name').in('id', memberIds)
    : { data: [] };
  const memberNameById = Object.fromEntries((memberProfiles || []).map((p) => [p.id, p.name || emailById[p.id] || 'משתמש']));
  const agentsByWorkspace = {};
  for (const m of memberRows || []) {
    agentsByWorkspace[m.workspace_id] = agentsByWorkspace[m.workspace_id] || [];
    agentsByWorkspace[m.workspace_id].push({ id: m.user_id, name: memberNameById[m.user_id] || 'משתמש' });
  }

  // תהליכים נוספים מקמפיינים פעילים (לא הקדשה) - "ריבוי תהליכים באותה
  // מחלקה" ממומש דרך התשתית הקיימת של campaign_contacts (שכבר תומכת
  // בכמה קמפיינים פעילים במקביל לאותו איש קשר), לא דרך שינוי סכמה של
  // contact_departments. כל תהליך-קמפיין מוצג כשורת StageStepper נוספת
  // ליד שורת השלב הרגילה של אותה מחלקה, ר' ContactDetailClient.js.
  const campaignIds = Array.from(new Set((campaignProcessRows || []).map((r) => r.campaign_id)));
  const campaignStagesById = Object.fromEntries(
    await Promise.all(campaignIds.map(async (id) => [id, await getCampaignStages(supabase, id)]))
  );
  const campaignProcessesByWorkspace = {};
  for (const row of campaignProcessRows || []) {
    const wsId = row.campaigns?.workspace_id;
    if (!wsId) continue;
    campaignProcessesByWorkspace[wsId] = campaignProcessesByWorkspace[wsId] || [];
    campaignProcessesByWorkspace[wsId].push({
      rowId: row.id,
      campaignId: row.campaign_id,
      campaignName: row.campaigns?.name || 'קמפיין',
      status: row.status,
      assignedTo: row.assigned_to,
      stages: campaignStagesById[row.campaign_id] || { order: [], wonStage: null, labels: {}, colors: {} },
    });
  }

  const departments = (departmentRows || []).map((row) => {
    const workspaceName = row.workspaces?.name || 'מחלקה';
    const hiddenExtraFieldKeys = hiddenExtraFieldsByWorkspace[row.workspace_id] || [];
    const fieldDefs = extraFieldDefsByWorkspaceName[workspaceName] || [];
    // חשוב: לא מוחקים כאן ערכי שדות שהצופה בחר להסתיר לעצמו מהקוביה -
    // "הסתרה אישית" היא העדפת תצוגה בלבד ואסור לה לגעת בנתונים עצמם.
    // מחיקת הערך מכאן הייתה שוברת כל שדה מחושב שמסתמך על השדה המוסתר
    // (הוא היה "נעלם" עבור הצופה הזה בלבד, בלי שום סיבה עניינית) וגם
    // הייתה מרוקנת את הערך בטאב "שדות נוספים" הניתן לעריכה. ההסתרה
    // מיושמת רק בשכבת התצוגה של הקוביה (GenericStatsTile.js), לא כאן.
    const filteredExtraFields = { ...(row.extra_fields || {}) };
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceName,
      stage: row.stage,
      closedReason: row.closed_reason,
      agentId: row.agent_id,
      agentName: agentNameById[row.agent_id] || null,
      lastActivityAt: row.last_activity_at,
      extraFields: filteredExtraFields,
      fieldDefs,
      hiddenExtraFieldKeys,
      createdByManager: !!row.created_by_manager,
      inquiries: [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      campaignProcesses: campaignProcessesByWorkspace[row.workspace_id] || [],
      hiddenWidgetKeys: hiddenWidgetsByWorkspace[row.workspace_id] || [],
    };
  });

  const referrerIds = Array.from(new Set(departments.map((d) => d.extraFields?.referred_by_contact_id).filter(Boolean)));
  const { data: referrerRows } = referrerIds.length
    ? await supabase.from('contacts').select('id, first, last').in('id', referrerIds)
    : { data: [] };
  const referrerNameById = Object.fromEntries((referrerRows || []).map((r) => [r.id, `${r.first || ''} ${r.last || ''}`.trim()]));
  for (const d of departments) {
    const refId = d.extraFields?.referred_by_contact_id;
    d.referrer = refId ? { id: refId, name: referrerNameById[refId] || 'איש קשר' } : null;
  }

  const workspaceNameById = Object.fromEntries((allWorkspaces || []).map((w) => [w.id, w.name]));
  const allInquiries = departments
    .flatMap((d) => (d.inquiries || []).map((inq) => ({ ...inq, workspaceName: d.workspaceName })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const viewerWorkspaceIds = (viewerMemberships || []).map((m) => m.workspace_id);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const tagGroups = groupTagsByDepartment(
    (tagRows || []).map((c) => ({ tags: c.tags, departments: (c.contact_departments || []).map((d) => ({ name: d.workspaces?.name })) }))
  );
  const connections = emailConnections || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const nextMeeting = (meetings || [])
    .filter((m) => m.meeting_date >= todayStr)
    .sort((a, b) => new Date(`${a.meeting_date}T${a.meeting_time || '00:00'}`) - new Date(`${b.meeting_date}T${b.meeting_time || '00:00'}`))[0] || null;
  const openTasksCount = (tasks || []).filter((t) => !t.done).length;

  let relatedContact = null;
  if (contact.related_contact_id) {
    const { data: rc } = await supabase.from('contacts').select('id, first, last').eq('id', contact.related_contact_id).single();
    relatedContact = rc;
  }

  return {
    props: {
      contact,
      departments,
      allWorkspaces: allWorkspaces || [],
      viewerWorkspaceIds,
      meetings: meetings || [],
      tasks: tasks || [],
      existingTags,
      tagGroups,
      sentEmails: sentEmailRows || [],
      emailConnections: connections,
      sentWhatsapp: sentWhatsappRows || [],
      whatsappTemplates: whatsappTemplates || [],
      emailTemplates: emailTemplates || [],
      nextMeeting,
      openTasksCount,
      relatedContact,
      agentsByWorkspace,
      allInquiries,
      workspaceNameById,
      donationTransactions: donationTransactionRows || [],
      commitments,
      dedications,
      dedicationCampaignId,
      callHistory: callHistoryRows || [],
      externalIds: externalIdRows || [],
      closeReasons,
      isManager,
      phoneCalls: phoneCallRows || [],
      pipelinesByWorkspace,
    },
  };
}
