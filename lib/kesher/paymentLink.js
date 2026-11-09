// קישור תשלום אישי לדף התשלום של קשר + זיהוי העסקה המתאימה בסנכרון.
// מודול טהור (בלי imports, בלי גישה ל-DB) - בשימוש גם בדפדפן (בניית הקישור
// במסך הרישום) וגם בשרת (סנכרון קשר, דף החזרה מהתשלום).
//
// איך זה עובד (לפי תיעוד ה-API של קשר, "פתיחת דף תשלום"): דף תשלום נפתח
// בקישור שמקבל פרמטרים - שם, טלפון, מייל, סכום, מספר תשלומים, כתובות חזרה,
// ושדה חופשי addactiondata שחוזר אחרי התשלום. אנחנו שמים בו מזהה אטום לכל
// ליד (payment_ref) ומחפשים אותו בעסקה כשהיא מסתנכרנת. בניית הקישור היא
// הוספת טקסט לכתובת בלבד - שום קריאה ל-API של קשר, כך שהאינטגרציה נשארת
// קריאה-בלבד. ת.ז. בכוונה לא נכללת בכתובת (ר' הערת GetLinkToken בתיעוד).

export const PAYMENT_REF_PATTERN = /mdc-[0-9a-f]{16}/i;
const PAYMENT_REF_EXACT = /^mdc-[0-9a-f]{16}$/i;

export function normalizePaymentRef(value) {
  const match = PAYMENT_REF_PATTERN.exec(String(value ?? ''));
  return match ? match[0].toLowerCase() : null;
}

export function isPaymentRef(value) {
  return PAYMENT_REF_EXACT.test(String(value ?? ''));
}

// קשר לא מתעדת באיזה שדה בעסקה נשמר addactiondata (Details / Comment / ...),
// ולכן סורקים את כל שדות הטקסט שלה. מזהה בפורמט שלנו לא מופיע במקרה בשדה אחר.
export function extractPaymentRef(transaction) {
  if (!transaction || typeof transaction !== 'object') return null;
  for (const value of Object.values(transaction)) {
    if (typeof value !== 'string') continue;
    const ref = normalizePaymentRef(value);
    if (ref) return ref;
  }
  return null;
}

// baseUrl = הקישור שקשר הנפיקה לדף התשלום (courses.payment_page_url או
// הקישור שנערך בליד). מחזיר null אם הכתובת אינה http(s) תקינה.
export function buildPersonalPaymentUrl(baseUrl, { ref, origin, firstName, lastName, phone, email, amount, installments } = {}) {
  let url;
  try {
    url = new URL(String(baseUrl ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!isPaymentRef(ref)) return null;

  const put = (key, value) => {
    const text = String(value ?? '').trim();
    if (text) url.searchParams.set(key, text);
  };

  put('firstname', firstName);
  put('lastname', lastName);
  put('tel', String(phone ?? '').replace(/[^\d+]/g, ''));
  put('mail', email);

  const total = Number(amount);
  if (total > 0) put('total', Number.isInteger(total) ? String(total) : total.toFixed(2));
  const payments = Math.floor(Number(installments));
  if (payments > 1) put('numpayment', String(payments));

  put('addactiondata', ref.toLowerCase());
  const cleanOrigin = String(origin ?? '').replace(/\/+$/, '');
  if (cleanOrigin) {
    put('successurl', `${cleanOrigin}/pay/${ref.toLowerCase()}`);
    put('failedurl', `${cleanOrigin}/pay/${ref.toLowerCase()}?r=failed`);
  }
  return url.toString();
}
