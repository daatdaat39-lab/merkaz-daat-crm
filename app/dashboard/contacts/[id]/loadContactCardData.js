'use server';

import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { groupTagsByDepartment } from '../../lib/tagGroups';
import { getPicklistValues } from '../../lib/picklists';
import { getAllPipelines } from '../../lib/pipelines';
import { getCampaignStages } from '../../lib/campaignStages';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getAllExtraFields } from '../../lib/extraFields';
import { getAllContactTagRows } from '../../lib/allContactTags';

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

  const [{ data: departmentRows }, { data: allWorkspaces }, { data: meetings }, { data: tasks }, tagRows, { data: viewerMemberships }, { data: sentEmailRows }, { data: emailConnections }, { data: sentWhatsappRows }, { data: whatsappTemplates }, { data: emailTemplates }, { data: donationTransactionRows }, { data: callHistoryRows }, { data: externalIdRows }, { data: phoneCallRows }, { data: campaignProcessRows }, { data: commitmentRows }, { data: additionalPhoneRows }, { data: courseEnrollmentRows }, { data: seminarParticipationRows }, { data: relationRowsForward }, { data: relationRowsReverse }, { data: importConflictRows }] = await Promise.all([
    supabase
      .from('contact_departments')
      .select('id, stage, closed_reason, workspace_id, agent_id, last_activity_at, extra_fields, created_by_manager, opened_process, workspaces:workspace_id (name), lead_inquiries (reason, note, created_at)')
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
    // רשימת התגיות נשלפת ממטמון משותף (5 דקות, ר' lib/allContactTags.js)
    // במקום לסרוק מחדש את כל 6,500+ אנשי הקשר בכל פתיחת כרטיס איש קשר.
    getAllContactTagRows(),
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
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('sort_order').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
    supabase
      .from('donation_transactions')
      .select('id, workspace_id, source_system, amount, transaction_date, commitment_id, receipt_url, designation, payment_method, transaction_type, campaign_reference, fundraiser_name, external_doc_number')
      .eq('contact_id', contact.id)
      .order('transaction_date', { ascending: false }),
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
      .select('id, workspace_id, total_amount, installments_count, status, note, created_at, start_date, end_date, frequency, bounced_count, external_reference, designation, payment_method, last_payment_status, source_channel, source_system, continued_from_commitment_id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('contact_phones')
      .select('id, phone, label, source, created_at')
      .eq('contact_id', contact.id)
      .order('created_at'),
    supabase
      .from('contact_course_enrollments')
      .select('id, workspace_id, year_label, course_name, course_code, confidence')
      .eq('contact_id', contact.id)
      .order('course_code', { ascending: false }),
    supabase
      .from('contact_seminar_participations')
      .select('id, workspace_id, event_type, year, kind, status, confidence, note')
      .eq('contact_id', contact.id)
      .order('year', { ascending: false }),
    supabase
      .from('contact_relations')
      .select('id, relation_label, related_contact_id, related:related_contact_id (id, first, last)')
      .eq('contact_id', contact.id),
    supabase
      .from('contact_relations')
      .select('id, relation_label, contact_id, owner:contact_id (id, first, last)')
      .eq('related_contact_id', contact.id),
    // קונפליקטים לא-פתורים על הכרטיס הזה עצמו - עד עכשיו נראו רק בתור
    // הגלובלי (settings/import-conflicts), בלי שום אינדיקציה על הכרטיס
    // הספציפי שהם נוגעים אליו.
    supabase
      .from('import_conflicts')
      .select('id, workspace_id, field_key, field_label, existing_value, new_value, source_system, batch_label, created_at, workspaces:workspace_id (name)')
      .eq('contact_id', contact.id)
      .eq('status', 'pending')
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
      openedProcess: row.opened_process !== false,
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
  // מקורות ידועים (לצורך הצעות ב-SourceMultiPicker) - contacts.source
  // הוא טקסט חופשי (לא מערך), לפעמים כבר מכיל כמה ערכים מופרדים-פסיק
  // (ר' אופציית "שניהם" במיזוג כפילויות) - מפרקים כל ערך לרכיבים בודדים
  // כדי שההצעות יהיו נקיות (למשל "צ'רידי", לא "צ'רידי, אורביט" כמכלול).
  const existingSources = Array.from(new Set(
    (tagRows || []).flatMap((c) => (c.source || '').split(',').map((s) => s.trim()).filter(Boolean))
  )).sort();
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
    // סכום תרומות זול (רק amount, מסונן לאיש-קשר בודד) - כדי להציג
    // "יש גם תרומות אצל X" בכרטיס בלי לשכפל/להעביר שום נתון כספי בפועל
    // (ר' תוכנית "זיהוי כרטיסי-זוג לפיצול").
    const [{ data: rc }, { data: relatedTxns }] = await Promise.all([
      supabase.from('contacts').select('id, first, last').eq('id', contact.related_contact_id).single(),
      supabase.from('donation_transactions').select('amount').eq('contact_id', contact.related_contact_id),
    ]);
    relatedContact = rc ? {
      ...rc,
      donationsTotal: (relatedTxns || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
      donationsCount: (relatedTxns || []).length,
    } : null;
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
      existingSources,
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
      callHistory: callHistoryRows || [],
      externalIds: externalIdRows || [],
      closeReasons,
      isManager,
      phoneCalls: phoneCallRows || [],
      pipelinesByWorkspace,
      additionalPhones: additionalPhoneRows || [],
      courseEnrollments: courseEnrollmentRows || [],
      seminarParticipations: seminarParticipationRows || [],
      relatedContacts: {
        forward: (relationRowsForward || []).map((r) => ({ id: r.id, label: r.relation_label, contact: r.related })),
        reverse: (relationRowsReverse || []).map((r) => ({ id: r.id, label: r.relation_label, contact: r.owner })),
      },
      importConflicts: importConflictRows || [],
    },
  };
}
