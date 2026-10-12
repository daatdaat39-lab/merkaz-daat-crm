// SLA למודול-שירות (שלב 4) - חומרה קובעת כמה זמן יש לטפל בקריאה, וצבע
// מחושב-ברינדור (ללא תשתית נוספת, ר' ארכיטקטורה-טכנית בתוכנית) - ירוק/
// צהוב/אדום לפי כמה זמן נשאר עד sla_due_at.
export const SEVERITY_LABELS = { urgent: 'דחוף', high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' };
export const SEVERITY_SLA_HOURS = { urgent: 4, high: 24, medium: 72, low: 168 };
export const STATUS_LABELS = { open: 'פתוח', in_progress: 'בטיפול', closed: 'סגור' };

export function computeSlaDueAt(severity) {
  const hours = SEVERITY_SLA_HOURS[severity] ?? SEVERITY_SLA_HOURS.medium;
  return new Date(Date.now() + hours * 3600000).toISOString();
}

// {label, color} - אדום = חרג, צהוב = פחות מרבע מחלון-הזמן המקורי נותר,
// ירוק = עדיין הרבה זמן. בלי sla_due_at (קריאה סגורה או ישנה) - ניטרלי.
export function slaStatus(slaDueAt, severity) {
  if (!slaDueAt) return { label: 'ללא SLA', color: '#9b9b9b', bg: '#f5f5f5' };
  const msLeft = new Date(slaDueAt).getTime() - Date.now();
  if (msLeft < 0) {
    const hoursOverdue = Math.round(-msLeft / 3600000);
    return { label: `חרג ב-${hoursOverdue} שעות`, color: '#a3392f', bg: '#fdecea' };
  }
  const totalHours = SEVERITY_SLA_HOURS[severity] ?? SEVERITY_SLA_HOURS.medium;
  const hoursLeft = msLeft / 3600000;
  if (hoursLeft <= totalHours * 0.25) {
    return { label: `נותרו ${Math.round(hoursLeft)} שעות`, color: '#92400e', bg: '#fffbeb' };
  }
  return { label: `נותרו ${Math.round(hoursLeft)} שעות`, color: '#15803d', bg: '#ecfdf3' };
}
