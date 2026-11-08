// PostgREST/Supabase מחזיר לכל היותר 1,000 שורות בקריאה בודדת - ובשקט, בלי
// שגיאה. דוחות שסופרים/מקבצים ב-JS על תוצאה כזו מציגים מספרים נמוכים
// מהאמת ברגע שיש יותר מ-1,000 שורות. הפונקציה עוברת על דפים עד שדף לא מלא.
// buildQuery חייבת להחזיר שאילתה *חדשה* בכל קריאה (builder לא ניתן לשימוש
// חוזר אחרי await). maxRows - רצפת ביטחון נגד לולאה אינסופית/עומס.
export async function fetchAllRows(buildQuery, { pageSize = 1000, maxRows = 50000 } = {}) {
  let all = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
  }
  return all;
}
