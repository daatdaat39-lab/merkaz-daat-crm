// מתי קוביית השלבים (StageStepper) צריכה להיפתח אוטומטית בכרטיס איש הקשר.
// לפי האפיון: הקוביה רלוונטית רק כשיש עדיין תהליך פעיל שדורש תשומת לב -
// פנייה חדשה, ליד יזום של המנהל, או סגירה. ברגע שהגיעו ליעד (תרם/תלמיד
// פעיל/בוגר) התהליך הסתיים בהצלחה ואין צורך להציג אותו כברירת מחדל -
// היא מתקפלת, בדיוק כמו בכל מצב "רגוע" אחר (תמיד אפשר לפתוח ידנית).
// לוגיקה טהורה בלי DB/React - קל לבדוק ולשנות בנפרד.

const RECENT_INQUIRY_DAYS = 7;

export function shouldOpenPipeline(department, pipeline) {
  if (!department) return false;

  // סגור/לא רלוונטי - תמיד מוצג, כדי שאפשר יהיה לראות למה ולחזור ממנו
  if (department.stage === 'closed') return true;

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

// תהליך "הסתיים" (הגיע לשלב-ניצחון מפורש, או לאחד השלבים הצדדיים כמו
// "נסגר"/"לא רלוונטי") - בשונה מ-shouldOpenPipeline (שרק קובע קיפול/
// פתיחה), זה קובע הסתרה מלאה של קוביית השלבים: תהליך שהסתיים כבר לא
// דורש מעקב שוטף, וההיסטוריה שלו נשארת מלאה בטאב "תהליכים" ובטאב
// "פעילות" - רק הקוביה האינטראקטיבית מוסתרת.
export function isProcessConcluded(stage, pipeline) {
  if (!pipeline || !stage) return false;
  if (pipeline.wonStage && stage === pipeline.wonStage) return true;
  if (pipeline.sideStages?.includes(stage)) return true;
  return false;
}
