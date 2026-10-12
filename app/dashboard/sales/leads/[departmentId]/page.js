import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { loadContactCardData } from '../../../contacts/[id]/loadContactCardData';
import { getPipeline } from '../../../lib/pipelines';
import LeadWorkScreen from './LeadWorkScreen';

// מסך-עבודה ייעודי לטיפול-בליד (שלב 3 ממודול מכירות/שירות) - route חדש
// לגמרי, לא הרחבה של המודאל הקיים של כרטיס-איש-הקשר. מפתח לפי
// contact_departments.id (לא contacts.id!) - כדי שהנעילה (migration 0148)
// תהיה לפי שיוך-מחלקה ספציפי, לא לפי איש-הקשר כולו.
export default async function LeadWorkPage({ params }) {
  const { departmentId } = params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: deptRow } = await supabase
    .from('contact_departments')
    .select('id, contact_id, workspace_id, workspaces:workspace_id (name)')
    .eq('id', departmentId)
    .maybeSingle();

  if (!deptRow) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        הליד הזה לא נמצא.
      </div>
    );
  }

  const allowed = await isMemberOfWorkspace(supabase, user.id, deptRow.workspace_id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        אין לך גישה לליד הזה.
      </div>
    );
  }

  const cardData = await loadContactCardData(deptRow.contact_id);
  if (cardData.redirectToLogin) redirect('/login');
  if (cardData.notFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        איש הקשר לא נמצא.
      </div>
    );
  }

  const { props } = cardData;
  const department = props.departments.find((d) => d.id === departmentId);
  if (!department) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        השיוך הזה לא נמצא יותר (אולי נמחק).
      </div>
    );
  }

  const [{ data: courses }, { data: playbookItems }, pipeline] = await Promise.all([
    supabase.from('courses').select('id, name, price').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('reference_content').select('id, course_id, tag, title, body').eq('kind', 'playbook').eq('is_active', true).order('sort_order'),
    getPipeline(supabase, deptRow.workspaces?.name),
  ]);

  return (
    <LeadWorkScreen
      departmentId={departmentId}
      contact={{
        id: props.contact.id, first: props.contact.first, last: props.contact.last,
        phone: props.contact.phone, phone2: props.contact.phone2, email: props.contact.email,
      }}
      department={department}
      stageLabel={pipeline.labels[department.stage] || department.stage}
      wonStageLabel={pipeline.wonStage ? (pipeline.labels[pipeline.wonStage] || pipeline.wonStage) : null}
      workspaceId={deptRow.workspace_id}
      workspaceName={deptRow.workspaces?.name}
      courses={courses || []}
      playbookItems={playbookItems || []}
      whatsappTemplates={props.whatsappTemplates}
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
