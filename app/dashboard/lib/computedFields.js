// שדה "מחושב" - ערכו לעולם לא נשמר, רק מחושב מחדש בזמן רינדור מתוך
// שדות אחרים של אותו איש קשר. אותו דפוס בדיוק כמו calculateAge/
// calculateHebrewDate ב-hebrewDate.js (מחושבים מ-birth_date), רק
// גנרי - מוגדר בהגדרות ← שדות מחלקתיים במקום קשיח בקוד. formula הוא
// שם קבוע מתוך רשימה סגורה (whitelist), לא מנוע נוסחאות חופשי.
export function computeFieldValue(field, extraValues) {
  if (field.type !== 'computed' || !field.options?.formula) return null;

  if (field.options.formula === 'remaining_months_from_date_plus_years') {
    const start = new Date(extraValues?.[field.options.dateField]);
    const years = Number(extraValues?.[field.options.durationField]);
    if (Number.isNaN(start.getTime()) || !years) return null;
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + years);
    const now = new Date();
    const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    return months > 0 ? `נותרו ${months} חודשים` : 'הסתיים';
  }

  return null; // נוסחה לא מוכרת - לא קורס, פשוט לא מציג ערך
}

export const COMPUTED_FORMULAS = [
  { value: 'remaining_months_from_date_plus_years', label: 'זמן שנותר (תאריך + משך בשנים, מול היום)' },
];
