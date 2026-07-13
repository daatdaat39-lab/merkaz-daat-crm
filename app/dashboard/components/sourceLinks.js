// מיפוי בין קישורים ייעודיים שניתנים למפרסמים שונים לבין שם המפרסם -
// המספר בסוף הקישור רלוונטי רק לדף הנחיתה הספציפי (לא גלובלי), לכן
// המפתח הוא הקישור המלא (אחרי פענוח URL-encoding), לא רק המספר.
// להוספת קישור חדש: תוסיפו שורה נוספת לאובייקט הזה.
export const SOURCE_LINK_MAP = {
  'https://daat.org.il/דעת-למדני-תואר-ראשון-3/': 'עומרי',
};

// מנסה לזהות מפרסם לפי קישור מלא שהתקבל מהמייל. מתעלם מפרמטרים שמתווספים
// אוטומטית לקישור (utm_source, fbclid וכו') ומסתכל רק על כתובת הדף עצמה -
// כי אלה משתנים בכל שיתוף ולא חלק מהזיהוי של המפרסם. אם לא נמצא - מחזיר
// את הקישור הגולמי (עדיף מידע חלקי על פני איבוד המידע לגמרי)
export function resolveSourceFromLink(rawLink) {
  if (!rawLink) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawLink.trim());
  } catch {
    decoded = rawLink.trim();
  }
  const pathOnly = decoded.split('?')[0].split('#')[0];
  return SOURCE_LINK_MAP[pathOnly] || SOURCE_LINK_MAP[decoded] || rawLink;
}
