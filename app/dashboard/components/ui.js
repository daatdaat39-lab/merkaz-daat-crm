import { STAGE_LABELS, STAGE_COLORS, PIPELINES } from './pipelines';

export const WS_COLORS = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626'];

export { STAGE_LABELS, STAGE_COLORS };
// ברירת מחדל למקומות ישנים שעדיין לא עודכנו לשלב-פר-מחלקה (ר' pipelines.js)
export const STAGE_ORDER = PIPELINES['דעת למדני'].order;

// מיפוי בין שם מחלקה למילות מפתח שמזהות שייכות דרך תגיות/dept
export const DEPT_KEYWORDS = {
  'תרומות': ['תרומה'],
  'לימודי': ['לימוד'],
  'מנהלה': ['מנהלה'],
};

// בודק אם איש קשר שייך למחלקה נתונה, לפי שדה dept או לפי אחת התגיות שלו
export function contactMatchesDept(contact, dept) {
  if (!dept) return true;
  if (contact.dept === dept) return true;
  const keywords = DEPT_KEYWORDS[dept] || [dept];
  return (contact.tags || []).some((tag) => keywords.some((kw) => tag.includes(kw)));
}

export function StageBadge({ stage }) {
  const c = STAGE_COLORS[stage] || STAGE_COLORS.open;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        background: c.bg,
        color: c.color,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

export function Tag({ children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        gap: 4,
        background: '#f0f0f0',
        color: '#333',
        marginInlineEnd: 4,
      }}
    >
      {children}
    </span>
  );
}

export function initials(first, last) {
  return `${(first || '?')[0] || ''}${(last || '')[0] || ''}`;
}
