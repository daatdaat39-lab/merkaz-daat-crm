// תאריך+שעה בפורמט ישראלי DD/MM/YYYY, HH:MM - לא toLocaleString('he-IL')
// (שמדפיס עם נקודות ובלי אפסים מובילים, למשל "30.8.2026" במקום "30/08/2026").
export function formatIsraeliDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
