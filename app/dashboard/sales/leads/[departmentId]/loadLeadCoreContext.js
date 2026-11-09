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
    .select('id, contact_id, workspace_id, created_at, workspaces:workspace_id (name, sells_courses)')
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

  const [{ data: courses }, pipeline, { data: checklist }, { data: courseTracks }, { data: formFields }, { data: uploadedDocuments }] = await Promise.all([
    supabase.from('courses').select('id, name, price, duration_type, checklist_forms_enabled, checklist_payment_enabled, registration_form_url, signature_template_url, payment_page_url').eq('is_active', true).order('sort_order').order('name'),
    getPipeline(supabase, deptRow.workspaces?.name),
    supabase.from('lead_conversion_checklist').select('*, course_tracks:track_id (id, label)').eq('contact_department_id', departmentId).maybeSingle(),
    department.courseId
      ? supabase.from('course_tracks').select('id, label').eq('course_id', department.courseId).eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
    // מערכת-טפסים-בסיסית (migration 0182) - רשימה-אחת-מסודרת-עם-type
    // (טקסט/מספר/תאריך/בחירה/קובץ/חתימה) במקום-שתי-שאילתות-נפרדות -
    // ה-UI מרנדר-לפי-type בלולאה-אחת (ר' LeadRegistrationScreen.js).
    department.courseId
      ? supabase.from('course_form_fields').select('id, field_key, label, type, options, required').eq('course_id', department.courseId).eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
    // מסמכים-שכבר-הועלו-לליד-הזה (migration 0180, contact_documents -
    // משותפת-למערכת, מסוננת-כאן-לפי contact_department_id).
    supabase.from('contact_documents').select('id, requirement_id, original_filename, file_path, uploaded_at').eq('contact_department_id', departmentId).order('uploaded_at', { ascending: false }),
  ]);

  return {
    supabase, userId: user.id, deptRow, department, props,
    courses: courses || [], checklist: checklist || null, courseTracks: courseTracks || [], formFields: formFields || [], pipeline,
    uploadedDocuments: uploadedDocuments || [],
  };
}
