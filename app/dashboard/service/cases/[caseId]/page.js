import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { loadContactCardData } from '../../../contacts/[id]/loadContactCardData';
import { ensureCaseActionChip } from '../../../lib/aiActionChip';
import CaseWorkScreen from './CaseWorkScreen';

// מסך-עבודה לקריאת-שירות בודדת (שלב 4) - אותו שלד תלת-עמודות כמו מסך-
// הליד (שלב 3), עם מאגר-ידע במקום תסריטי-מכירה ו-SLA במקום כפתור-המרה.
export default async function CaseWorkPage({ params }) {
  const { caseId } = params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: caseRow } = await supabase
    .from('service_cases')
    .select('id, case_number, contact_id, workspace_id, course_id, subject, status, severity, sla_due_at, assigned_to, created_at, ai_action_summary, ai_action_summary_stale, workspaces:workspace_id (name)')
    .eq('id', caseId)
    .maybeSingle();

  if (!caseRow) {
    return <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>הקריאה הזו לא נמצאה.</div>;
  }

  const allowed = await isMemberOfWorkspace(supabase, user.id, caseRow.workspace_id);
  if (!allowed) {
    return <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>אין לך גישה לקריאה הזו.</div>;
  }

  const cardData = await loadContactCardData(caseRow.contact_id);
  if (cardData.redirectToLogin) redirect('/login');
  if (cardData.notFound) {
    return <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>איש הקשר לא נמצא.</div>;
  }
  const { props } = cardData;

  const [{ data: kbItems }, { data: members }, { data: whatsappTemplates }] = await Promise.all([
    supabase.from('reference_content').select('id, course_id, tag, title, body').eq('kind', 'kb').eq('is_active', true).order('sort_order'),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', caseRow.workspace_id),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text, course_id').order('sort_order').order('created_at'),
  ]);
  const memberIds = (members || []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length
    ? await supabase.from('profiles').select('id, name').in('id', memberIds)
    : { data: [] };
  const agents = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));

  const aiActionText = await ensureCaseActionChip(supabase, {
    id: caseId, stale: caseRow.ai_action_summary_stale !== false, cachedSummary: caseRow.ai_action_summary,
    contactName: `${props.contact.first} ${props.contact.last}`, courseId: caseRow.course_id,
    communication: {
      inquiries: props.allInquiries, meetings: props.meetings, tasks: props.tasks,
      sentEmails: props.sentEmails, sentWhatsapp: props.sentWhatsapp, callHistory: props.callHistory, phoneCalls: props.phoneCalls,
    },
  });

  return (
    <CaseWorkScreen
      caseId={caseId}
      aiActionText={aiActionText}
      caseData={{
        caseNumber: caseRow.case_number, subject: caseRow.subject, status: caseRow.status,
        severity: caseRow.severity, slaDueAt: caseRow.sla_due_at, assignedTo: caseRow.assigned_to,
        courseId: caseRow.course_id, createdAt: caseRow.created_at,
      }}
      contact={{
        id: props.contact.id, first: props.contact.first, last: props.contact.last,
        phone: props.contact.phone, phone2: props.contact.phone2, email: props.contact.email,
      }}
      workspaceName={caseRow.workspaces?.name}
      agents={agents}
      kbItems={kbItems || []}
      whatsappTemplates={whatsappTemplates || []}
      workspaceId={caseRow.workspace_id}
      timelineProps={{
        inquiries: props.allInquiries,
        sentEmails: props.sentEmails,
        sentWhatsapp: props.sentWhatsapp,
        donationTransactions: props.donationTransactions,
        callHistory: props.callHistory,
        phoneCalls: props.phoneCalls,
        meetings: props.meetings,
        workspaceNameById: props.workspaceNameById,
      }}
    />
  );
}
