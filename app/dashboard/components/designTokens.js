// עזרי סגנון משותפים לעיצוב המודרני (פינות מעוגלות יותר, צלליות
// רכות, ריווח נקי) - במקום שכל קובץ יגדיר מחדש כרטיס/KPI/hover
// משלו inline. לשימוש בקבצים חדשים ובמסכי המפתח שעברו שדרוג עיצובי;
// לא מחליף את ה-inline styles הקיימים בכל הפרויקט (scope לא ריאלי).
export const card = (extra = {}) => ({
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-soft)',
  ...extra,
});

export const kpiTile = (extra = {}) => ({
  ...card(),
  padding: '18px 20px',
  ...extra,
});

// לכרטיסים לחיצים/אינטראקטיביים - צריך גם className="card-hover" (מ-globals.css)
export const iconBlock = (extra = {}) => ({
  ...card(),
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  cursor: 'pointer',
  ...extra,
});

export const sectionLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};
