// אין כאן קליינט API - hallo015 (015) הוא רק שולח webhook בסיום שיחה
// (ר' app/api/webhooks/hallo015-call/route.js), אין קריאה יוצאת שלנו
// אליהם. הפונקציה הזו רק בודקת שהסוד להגנת ה-webhook מוגדר, כמו
// isKesherConfigured/isInforuConfigured לשאר האינטגרציות.
export function isHallo015Configured() {
  return Boolean(process.env.HALLO015_WEBHOOK_SECRET);
}

// משותפת בין ה-webhook (התאמת snumber/dnumber ל-contacts.phone/phone2)
// לבין פייפליין קליטת הקלטות מייל (app/api/cron/poll-call-recordings) -
// משווה מספרים בלי קידומת/אפסים מובילים לפי 9 הספרות האחרונות.
export function normalizePhone(p) {
  return (p || '').replace(/\D/g, '').slice(-9);
}
