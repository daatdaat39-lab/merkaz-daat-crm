// אינטגרציית "קשר" (ספק סליקה/תרומות חיצוני) - קריאה בלבד, במכוון.
// הקובץ הזה מיישם אך ורק את שתי פונקציות הדוחות (GetTrans, GetObligations)
// ולעולם לא יורחב לפעולות מחייבות (חיוב/זיכוי/הקמת הוראת קבע/ביטול) -
// גם אם ה-credential ב-KESHER_USERNAME/KESHER_PASSWORD טכנית מסוגל לזה.
// זו החלטה מוצהרת של המשתמש, לא מגבלה טכנית: קשר לא מציעה credential
// שמוגבל מובנית ל-read-only, כך שההגנה היחידה האמיתית היא כאן - בכך
// שאין בקוד הזה שום נתיב לפונקציות כמו SendTransaction/ChargeNextCollection/
// SendBankObligation/CreateCompany וכו'.
const KESHER_ENDPOINT = 'https://kesherhk.info/ConnectToKesher/ConnectToKesher';

export function isKesherConfigured() {
  return Boolean(process.env.KESHER_USERNAME && process.env.KESHER_PASSWORD);
}

async function callKesher(func, params) {
  const res = await fetch(KESHER_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      func,
      format: 'json',
      userName: process.env.KESHER_USERNAME,
      password: process.env.KESHER_PASSWORD,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.Message) throw new Error(`קריאה ל-קשר (${func}) נכשלה: ${data.Message || res.statusText}`);
  return data;
}

// דוח עסקאות - שליפה לפי טווח תאריכים. מחזיר מערך גם/רק לתשובה
// יחידה (הפורמט של קשר לא עקבי בין 0/1/כמה תוצאות - ר' תיעוד).
export async function getKesherTransactions({ fromDate, toDate }) {
  const data = await callKesher('GetTrans', { fromDate, toDate });
  const t = data?.Transaction;
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

// דוח התחייבויות (הוראות קבע) - שליפה לפי טווח תאריכים.
export async function getKesherObligations({ fromDate, toDate }) {
  const data = await callKesher('GetObligations', { fromDate, toDate });
  const o = data?.Obligation;
  if (!o) return [];
  return Array.isArray(o) ? o : [o];
}
