import { createClient } from '../../../../../lib/supabase/server';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { loadContactCardData } from '../../../contacts/[id]/loadContactCardData';
import { getPipeline } from '../../../lib/pipelines';

// ליבה-משותפת לשני-מסכי-הליד (מסך-הטיפול-הראשי ומסך-הרישום-הנפרד,
// route חדש ב-registration/) - מחולצת-מתוך page.js המקורי. **בכוונה**
// לא-כוללת playbookItems/sendConnections/emailTemplates/AI-chip/
// timeline-summary - אלה-יקרים-ו/או-ייחודיים-למסך-הראשי-בלבד.
export async function loadLeadCoreContext(departmentId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirectToLogin: true };

  const { data: deptRow } = await supabase
    .from('contact_departments')
    .select('id, contact_id, workspace_id, workspaces:workspace_id (name)')
    .eq('id', departmentId)
    .maybeSingle();
  if (!deptRow) return { deptNotFound: true };

  const allowed = await isMemberOfWorkspace(supabase, user.id, deptRow.workspace_id);
  if (!allowed) return { noAccess: true };

  const cardData = await loadContactCardData(deptRow.contact_id);
  if (cardData.redirectToLogin) return { redirectToLogin: true };
  if (cardData.notFound) return { contactNotFound: true };

  const { props } = cardData;
  const department = props.departments.find((d) => d.id === departmentId);
  if (!department) return { departmentNotFound: true };

  const [{ data: courses }, pipeline, { data: checklist }, { data: courseTracks }] = await Promise.all([
    supabase.from('courses').select('id, name, price, duration_type, checklist_forms_enabled, checklist_payment_enabled, checklist_signatures_enabled').eq('is_active', true).order('sort_order').order('name'),
    getPipeline(supabase, deptRow.workspaces?.name),
    supabase.from('lead_conversion_checklist').select('*, course_tracks:track_id (id, label)').eq('contact_department_id', departmentId).maybeSingle(),
    department.courseId
      ? supabase.from('course_tracks').select('id, label').eq('course_id', department.courseId).eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
  ]);

  return {
    supabase, deptRow, department, props,
    courses: courses || [], checklist: checklist || null, courseTracks: courseTracks || [], pipeline,
  };
}
