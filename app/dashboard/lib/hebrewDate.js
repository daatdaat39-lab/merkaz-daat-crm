import { HDate } from '@hebcal/core';

// גיל מדויק (לוקח בחשבון אם יום ההולדת השנה כבר עבר)
export function calculateAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

// תאריך עברי בגימטריה (למשל "כ׳ אייר תש״נ") - מסירים ניקוד כדי
// שיתאים לשאר הממשק שכתוב בעברית פשוטה בלי ניקוד
export function calculateHebrewDate(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  const hdate = new HDate(birth);
  return hdate.renderGematriya().replace(/[֑-ׇ]/g, '');
}
