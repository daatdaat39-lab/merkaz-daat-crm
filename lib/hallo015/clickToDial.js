import { normalizePhone } from './config';

// חיוג-יזום (click-to-dial) - בניגוד ל-webhook (hallo015-call/route.js,
// שרק מקבל אירועים מ-015), זו קריאה *יוצאת* ראשונה שלנו אליהם: מרימים
// שיחה בת-שני-רגליים (calls/make) - קודם מצלצלים לשלוחת-הנציג, וברגע
// שהוא עונה מחברים אותו ללקוח. אימות auth_username/auth_password
// (לא API-key) - חשבון-הפאנל הקיים isarad, לא חשבון-ייעודי (הוחלט
// במכוון, ר' plan - 015 אין להם מנגנון-חשבון-ייעודי-ל-API בפאנל).
const API_BASE = 'https://www.015pbx.net/api/json';

export function isClickToDialConfigured() {
  return Boolean(process.env.HALLO015_API_USERNAME && process.env.HALLO015_API_PASSWORD);
}

const ERROR_BY_CODE = {
  400: 'פרמטרים שגויים בבקשת-החיוג',
  401: 'פרטי-ההתחברות ל-015 שגויים (auth_username/auth_password) - פנה למנהל המערכת',
  402: 'לחשבון המשמש לחיוג אין הרשאה לפעולה הזו ב-015',
  403: 'תוכנית-התעריפים של 015 לא מאפשרת חיוג-יזום',
};

// fromExtension - השלוחה-הארוכה של הנציג כפי-שמופיעה ב-015 (Features →
// Telephone lines, למשל "5668598446" - לא השלוחה-הקצרה "211").
// toNumber - מספר-הלקוח, כפי-שמור אצלנו (מנורמל לפני השליחה).
export async function makeCall({ fromExtension, toNumber }) {
  if (!isClickToDialConfigured()) throw new Error('חיוג-יזום לא מוגדר בשרת (חסרים פרטי-API)');
  if (!fromExtension) throw new Error('לא הוגדרה שלוחת-015 עבורך - פנה למנהל המערכת');
  const normalized = normalizePhone(toNumber);
  if (!normalized) throw new Error('לאיש הקשר אין מספר-טלפון תקין לחיוג');

  const params = new URLSearchParams({
    auth_username: process.env.HALLO015_API_USERNAME,
    auth_password: process.env.HALLO015_API_PASSWORD,
    stype: 'phone',
    snumber: fromExtension,
    cnumber: toNumber,
    wait: '8',
  });

  const res = await fetch(`${API_BASE}/calls/make/?${params.toString()}`, { method: 'GET' });
  const rawText = await res.text();
  // דיבוג-זמני: לוח-הבדיקה-החי גילה שהתשובה הגיעה "הצלחה" אבל שום שיחה
  // לא נוצרה בפועל (לא היה webhook מ-015 בכלל) - צריך לראות את ה-body
  // הגולמי ב-Vercel Logs כדי להבין מה 015 מחזירים בפועל. להסיר אחרי שזה נפתר.
  console.log('hallo015 calls/make http status:', res.status, 'raw body:', rawText);
  let data;
  try { data = JSON.parse(rawText); } catch { data = {}; }
  const response = data?.responses?.[0];
  const code = Number(response?.code ?? res.status);

  if (code !== 200 && code !== 204) {
    throw new Error(ERROR_BY_CODE[code] || response?.message || `החיוג נכשל (קוד ${code || res.status})`);
  }
  return { server: data?.data?.server || null, callid: data?.data?.callid || null };
}
