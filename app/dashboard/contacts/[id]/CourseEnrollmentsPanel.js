'use client';

// תצוגה קריאה-בלבד של היסטוריית הרשמות לקורסים (contact_course_enrollments) -
// אותה תבנית בדיוק כמו KesherProjectPanel.js (בלי שום כפתור פעולה).
// שימוש ראשון: ייבוא היסטורי מ"אורביט" (דעת ותבונה) - כל שורה בקובץ
// המקור הופכת לרשומה נפרדת כאן, לא נדרסת ולא ממוזגת. הרשמה עם
// confidence='low' (מגיעה משנה בלי מזהה-סטודנט מקורי, ולא נמצאה לה
// התאמת טלפון/מייל ודאית) מסומנת בעדינות - לא מוסתרת - כדי שהצוות ידע
// איפה כדאי לבדוק ידנית אם זה בכלל אותו אדם.
export default function CourseEnrollmentsPanel({ enrollments = [] }) {
  if (enrollments.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #9b9b9b)', textTransform: 'uppercase', marginBottom: 10 }}>
        הרשמות לקורסים ({enrollments.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {enrollments.map((e) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span>{e.year_label} — {e.course_name || 'קורס'}{e.course_code ? ` (מחזור ${e.course_code})` : ''}</span>
            {e.confidence === 'low' && (
              <span
                title="זוהה רק לפי שם - ייתכן שזה אותו אדם עם פרטי קשר שונים, כדאי לבדוק ידנית"
                style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 6px', cursor: 'help' }}
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
