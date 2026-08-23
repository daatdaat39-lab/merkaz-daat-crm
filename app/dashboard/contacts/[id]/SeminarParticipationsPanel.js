'use client';

// תצוגה קריאה-בלבד של היסטוריית השתתפות בסמינרים/אירועי חג
// (contact_seminar_participations) - אותה תבנית בדיוק כמו
// CourseEnrollmentsPanel.js (בלי שום כפתור פעולה). kind='pledge' (נדבה)
// מוצג כשורה נפרדת, לא ממוזג עם רשומת ההשתתפות של אותו אירוע - הוחלט
// במפורש כך (ייבוא סמינרים, ראש השנה תשפ"ד).
export default function SeminarParticipationsPanel({ participations = [] }) {
  if (participations.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #9b9b9b)', textTransform: 'uppercase', marginBottom: 10 }}>
        השתתפות בסמינרים ({participations.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {participations.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5 }}>
            <span style={{ flex: 1 }}>
              {p.event_type} {p.year} — {p.kind === 'pledge' ? 'נדבה' : (p.status === 'attended' ? 'השתתף' : 'התעניין')}
              {p.note ? ` (${p.note})` : ''}
            </span>
            {p.confidence === 'low' && (
              <span
                title="זוהה בלי שום פרט מזהה (טלפון/אימייל) - ייתכן שזה אותו אדם עם פרטי קשר שונים, כדאי לבדוק ידנית"
                style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 6px', cursor: 'help', flexShrink: 0 }}
              >
                ?
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
