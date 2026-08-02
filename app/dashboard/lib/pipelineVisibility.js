// מתי קוביית השלבים (StageStepper) צריכה להיפתח אוטומטית בכרטיס איש הקשר.
// לפי האפיון: הקוביה רלוונטית רק ברגעי החלטה - פנייה חדשה, ליד יזום של
// המנהל, הפיכה לתורם/תלמיד פעיל, או סגירה. בשאר הזמן היא מקופלת (לא
// מוסתרת - תמיד אפשר לפתוח ידנית) כדי לא להעמיס על הכרטיס.
// לוגיקה טהורה בלי DB/React - קל לבדוק ולשנות בנפרד.

const RECENT_INQUIRY_DAYS = 7;

// שלבים שנחשבים "הגיע ליעד" ולכן מצדיקים הצגת התהליך המלא
const MILESTONE_STAGES = ['active_donor', 'active_student', 'graduate', 'donated'];

export function shouldOpenPipeline(department, pipeline) {
  if (!department) return false;

  // סגור/לא רלוונטי - תמיד מוצג, כדי שאפשר יהיה לראות למה ולחזור ממנו
  if (department.stage === 'closed') return true;

  // הגיע לשלב יעד (תורם פעיל / תלמיד פעיל / בוגר / תרם)
  if (MILESTONE_STAGES.includes(department.stage)) return true;
  if (pipeline?.wonStage && department.stage === pipeline.wonStage) return true;

  // ליד שנוצר ביוזמת המנהל - הוקצה לטיפול, אז התהליך רלוונטי
  if (department.createdByManager) return true;

  // פנייה חדשה בימים האחרונים
  const latestInquiry = department.inquiries?.[0]?.created_at;
  if (latestInquiry) {
    const days = (Date.now() - new Date(latestInquiry).getTime()) / 86400000;
    if (days <= RECENT_INQUIRY_DAYS) return true;
  }

  return false;
}
