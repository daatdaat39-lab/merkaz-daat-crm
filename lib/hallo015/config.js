// webhook-הכניסה (015 שולחת אלינו, ר' app/api/webhooks/hallo015-call)
// נפרד-לגמרי מה-API-היוצא-המאומת (clickToDial.js/recordings.js, אנחנו
// קוראים-אליהם). הפונקציה הזו בודקת רק שהסוד להגנת ה-webhook מוגדר, כמו
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
