import { redirect } from 'next/navigation';
import { loadLeadCoreContext } from '../loadLeadCoreContext';
import LeadRegistrationScreen from '../LeadRegistrationScreen';
import { findPossiblePaymentMatch } from '../leadChecklistActions';

// "בדיקה מחדש" (recheckKesherPayment) פונה בזמן אמת לקשר - נותנים לה זמן.
export const maxDuration = 60;

// מסך-רישום נפרד (route חדש) - "שלב 2" של טיפול-בליד: טפסים/תשלומים/
// חתימות + אישור-המרה מפורש. נגיש-תמיד מ-LeadWorkScreen (קישור "מעבר
// לפרטי רישום") בלי-תלות-בשלב-pipeline - ר' דיון "מסך-רישום נפרד".
export default async function LeadRegistrationPage({ params }) {
  const { departmentId } = params;
  const ctx = await loadLeadCoreContext(departmentId);

  if (ctx.redirectToLogin) redirect('/login');
  if (ctx.deptNotFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        הליד הזה לא נמצא.
      </div>
    );
  }
  if (ctx.noAccess) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        אין לך גישה לליד הזה.
      </div>
    );
  }
  if (ctx.contactNotFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        איש הקשר לא נמצא.
      </div>
    );
  }
  if (ctx.departmentNotFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        השיוך הזה לא נמצא יותר (אולי נמחק).
      </div>
    );
  }

  const { supabase, userId, deptRow, department, props, courses, checklist, courseTracks, formFields, pipeline, uploadedDocuments } = ctx;
  const selectedCourse = courses.find((c) => c.id === department.courseId);

  // היסטוריית-וואטסאפ-ששייכת-לליד-הזה-בדיוק - אותו עיקרון "חוקת-הליד"
  // כמו ב-page.js הראשי, כדי שחלון-הצ'אט (WhatsAppSendModal) לא-ייפתח-
  // ריק כשכבר-נשלחו-הודעות (ר' דיון "איפה-רואים-היסטוריית-שליחה").
  const includeNullDept = props.departments.filter((d) => d.workspaceId === deptRow.workspace_id).length <= 1;
  const sentWhatsapp = props.sentWhatsapp.filter((w) => w.contact_department_id === departmentId
    || (includeNullDept && w.contact_department_id == null && w.workspace_id === deptRow.workspace_id));

  // נטענים-כאן (לא-בליבה-המשותפת) - נדרשים-רק-למסך-הזה (כפתורי "שלח
  // במייל/וואטסאפ" לקישורי-הטפסים/חתימה, ובדיקת-רכישה-קיימת לתצוגת-
  // "ההרשמה כבר הושלמה" + כפתור-ביטול - ר' דיון "תקלה במעבר-שלב").
  const [{ data: sendConnections }, { data: emailTemplates }, { data: existingPurchase }] = await Promise.all([
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('email_templates').select('id, name, subject, body, workspace_id, stage_key, category, course_id, is_active').order('created_at'),
    supabase.from('course_purchases').select('id, created_at, cohort_label').eq('contact_department_id', departmentId).neq('status', 'cancelled').maybeSingle(),
  ]);

  // רמז-התאמת-תשלום רך (לא-אישור-אוטומטי) - קריאה-בלבד, ר' תיעוד
  // ב-findPossiblePaymentMatch עצמה. מתבצעת רק-כש-יש-סכום-להשוות-אליו.
  const paymentMatch = await findPossiblePaymentMatch(
    props.contact.id,
    deptRow.created_at,
    checklist?.payment_total_amount ?? selectedCourse?.price,
    checklist?.payment_ref,
    { workspaceId: deptRow.workspace_id, linkSentAt: checklist?.payment_link_sent_at || null }
  );

  return (
    <LeadRegistrationScreen
      departmentId={departmentId}
      contact={{
        id: props.contact.id, first: props.contact.first, last: props.contact.last,
        phone: props.contact.phone, email: props.contact.email,
      }}
      workspaceId={deptRow.workspace_id}
      workspaceName={deptRow.workspaces?.name}
      stageKey={department.stage}
      userId={userId}
      agentId={department.agentId || null}
      sellsCourses={!!deptRow.workspaces?.sells_courses}
      selectedCourse={selectedCourse}
      courseTracks={courseTracks}
      formFields={formFields}
      uploadedDocuments={uploadedDocuments}
      checklist={checklist}
      paymentMatch={paymentMatch}
      existingPurchase={existingPurchase}
      wonStageLabel={pipeline.wonStage ? (pipeline.labels[pipeline.wonStage] || pipeline.wonStage) : null}
      sendConnections={sendConnections || []}
      whatsappTemplates={props.whatsappTemplates}
      emailTemplates={emailTemplates || []}
      sentWhatsapp={sentWhatsapp}
    />
  );
}
