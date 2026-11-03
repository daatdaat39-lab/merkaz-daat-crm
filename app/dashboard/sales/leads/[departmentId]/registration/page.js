import { redirect } from 'next/navigation';
import { loadLeadCoreContext } from '../loadLeadCoreContext';
import LeadRegistrationScreen from '../LeadRegistrationScreen';

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

  const { department, props, courses, checklist, courseTracks, pipeline } = ctx;
  const selectedCourse = courses.find((c) => c.id === department.courseId);

  return (
    <LeadRegistrationScreen
      departmentId={departmentId}
      contact={{ id: props.contact.id, first: props.contact.first, last: props.contact.last }}
      selectedCourse={selectedCourse}
      courseTracks={courseTracks}
      checklist={checklist}
      wonStageLabel={pipeline.wonStage ? (pipeline.labels[pipeline.wonStage] || pipeline.wonStage) : null}
    />
  );
}
