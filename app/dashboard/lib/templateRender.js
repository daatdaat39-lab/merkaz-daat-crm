// הצבת פרטי איש הקשר בתבניות מייל - קובץ רגיל (לא 'use server') כדי שיהיה
// משותף לחלון כתיבת מייל (לקוח) ולביצוע אוטומציות (שרת). עד היום החלון
// החליף רק {שם}, והאוטומציה לא החליפה כלום - מייל אוטומטי יצא עם "{שם}"
// כלשונו אצל הלקוח.
export function renderTemplate(text, { first, last } = {}) {
  const f = (first || '').trim();
  const l = (last || '').trim();
  let out = String(text ?? '')
    .replace(/\{שם פרטי\}/g, f)
    .replace(/\{שם משפחה\}/g, l)
    .replace(/\{שם מלא\}/g, `${f} ${l}`.trim())
    .replace(/\{שם\}/g, f);
  // בלי שם פרטי: "שלום ," הופך ל"שלום רב," ורווח לפני פסיק נמחק
  out = out.replace(/שלום\s+,/g, 'שלום רב,').replace(/[ \t]+,/g, ',');
  return out;
}

// משתנים שנשארו בטקסט ({...}) אחרי ההצבה - סימן לשגיאת הקלדה בתבנית או
// למשתנה שלא נתמך. שליחה אוטומטית עם כאלה נחסמת כדי שלא יצא "{שם}" ללקוח.
export function findUnresolvedPlaceholders(text) {
  return String(text ?? '').match(/\{[^{}\n]{1,30}\}/g) || [];
}
