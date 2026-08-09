import { HDate, gematriya } from '@hebcal/core';

// גיל מדויק בשנים וחודשים (למשל "17 שנים ו-3 חודשים", או "8 חודשים"
// לתינוקות/פעוטות מתחת לשנה) - לא רק שנים עגולות
export function calculateAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  const today = new Date();

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }

  if (years < 1) return `${months} ${months === 1 ? 'חודש' : 'חודשים'}`;
  if (months === 0) return `${years} ${years === 1 ? 'שנה' : 'שנים'}`;
  return `${years} ${years === 1 ? 'שנה' : 'שנים'} ו-${months} ${months === 1 ? 'חודש' : 'חודשים'}`;
}

// תאריך עברי בגימטריה (למשל "כ׳ אייר תש״נ") - מסירים ניקוד כדי
// שיתאים לשאר הממשק שכתוב בעברית פשוטה בלי ניקוד
export function calculateHebrewDate(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  const hdate = new HDate(birth);
  return hdate.renderGematriya().replace(/[֑-ׇ]/g, '');
}

// יום+חודש עברי בלי שנה (למשל "כ״ו אב") - לתצוגה קומפקטית ליד כל יום
// בלוח השנה. משתמש באותו renderGematriya כמו למעלה ופשוט משמיט את
// המילה האחרונה (השנה).
export function hebrewDayMonth(dateOrStr) {
  if (!dateOrStr) return '';
  const hdate = new HDate(new Date(dateOrStr));
  const parts = hdate.renderGematriya().replace(/[֑-ׇ]/g, '').split(' ');
  return parts.slice(0, 2).join(' ');
}

// שם חודש עברי + שנה, בלי יום (למשל "אלול תשפ״ו") - לכותרת הניווט
// כשלוח השנה במצב עברי. משתמש ב-HDate של היום ה-1 בחודש ומשמיט את
// היום מהפלט.
export function hebrewMonthYearLabel(month, year) {
  const hdate = new HDate(1, month, year);
  const parts = hdate.renderGematriya().replace(/[֑-ׇ]/g, '').split(' ');
  return parts.slice(1).join(' ');
}

// שם חודש עברי + שנה לתאריך לועזי נתון - עטיפה נוחה סביב
// hebrewMonthYearLabel שלא דורשת מהקורא לחשב month/year בעצמו.
export function hebrewMonthYearLabelForDate(gregDate) {
  const h = new HDate(gregDate);
  return hebrewMonthYearLabel(h.getMonth(), h.getFullYear());
}

// כמה חודשים יש בשנה העברית הנתונה (12 בשנה רגילה, 13 בשנה מעוברת) -
// עוטף HDate.monthsInYear כדי שלא נצטרך לייבא HDate בכל קובץ שמנווט
// חודשים עבריים.
export function hebrewMonthsInYear(year) {
  return HDate.monthsInYear(year);
}

// מזיז n חודשים עבריים קדימה/אחורה מתאריך לועזי נתון, ומחזיר את היום
// הראשון (לועזי) של החודש העברי החדש - עוקף בעיות "יום 31 בחודש בלי
// 31 ימים" ע"י תמיד לנחות על יום 1, מטפל נכון בשנה מעוברת (13 חודשים)
// כי שואל את HDate.monthsInYear מחדש בכל שנה שעוברים דרכה.
export function shiftHebrewMonth(gregDate, delta) {
  const h = new HDate(gregDate);
  let month = h.getMonth();
  let year = h.getFullYear();
  month += delta;
  while (month < 1) { year -= 1; month += HDate.monthsInYear(year); }
  while (month > HDate.monthsInYear(year)) { month -= HDate.monthsInYear(year); year += 1; }
  return new HDate(1, month, year).greg();
}

// כל ימי החודש העברי שמכיל את gregDate, כל אחד עם תאריך לועזי מקביל -
// לבניית לוח חודש עברי (7 עמודות, מיושר לפי יום בשבוע האמיתי של כל יום).
export function hebrewMonthDays(gregDate) {
  const h = new HDate(gregDate);
  const month = h.getMonth();
  const year = h.getFullYear();
  const first = new HDate(1, month, year);
  const count = first.daysInMonth();
  return Array.from({ length: count }, (_, i) => {
    const hd = new HDate(i + 1, month, year);
    return { hebrewDay: gematriya(i + 1), greg: hd.greg() };
  });
}
