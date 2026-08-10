// אין כאן קליינט API - hallo015 (015) הוא רק שולח webhook בסיום שיחה
// (ר' app/api/webhooks/hallo015-call/route.js), אין קריאה יוצאת שלנו
// אליהם. הפונקציה הזו רק בודקת שהסוד להגנת ה-webhook מוגדר, כמו
// isKesherConfigured/isInforuConfigured לשאר האינטגרציות.
export function isHallo015Configured() {
  return Boolean(process.env.HALLO015_WEBHOOK_SECRET);
}
