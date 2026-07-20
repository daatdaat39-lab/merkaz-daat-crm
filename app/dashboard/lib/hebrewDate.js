import { HDate } from '@hebcal/core';

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
