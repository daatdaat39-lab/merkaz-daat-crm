'use client';

// תצוגה קריאה-בלבד של הרשמות-לקורסים (course_purchases, migration 0148) -
// עד-עכשיו לא הוצג בשום-מקום בכרטיס-איש-קשר בכלל. אותו דפוס בדיוק כמו
// CourseEnrollmentsPanel/KesherProjectPanel (בלי כפתורי-פעולה - ההרשמה
// עצמה נוצרת רק דרך "המרה" במסך-הליד).
//
// סטטוס-התצוגה ("פעיל"/"בוגר") מחושב כאן-ברינדור מ-cohort/תאריכים (ר'
// migration 0161) - לא מ-status הקיים (זה נשאר לסטטוס-המכירה pending/
// completed, ממד נפרד-לגמרי). purchase.enrollmentEndDate עשוי-להיות
// undefined עד שהמיגרציה 0161 תרוץ - מטופל בעדינות (fallback ל-"פעיל").
function computeLifecycleBadge(purchase) {
  const endDate = purchase.enrollment_end_date;
  if (!endDate) return { label: 'פעיל', tone: 'ok' };
  const isPast = new Date(endDate) < new Date();
  return isPast ? { label: 'בוגר', tone: 'muted' } : { label: 'פעיל', tone: 'ok' };
}

const SALE_STATUS_LABELS = { pending: 'ממתין לתשלום', completed: 'נרכש', cancelled: 'בוטל' };

export default function CoursePurchasesPanel({ purchases = [] }) {
  if (purchases.length === 0) return null;

  return (
    <div style={{ background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-text-muted, #9b9b9b)', textTransform: 'uppercase', marginBottom: 10 }}>
        קורסים ({purchases.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {purchases.map((p) => {
          const badge = computeLifecycleBadge(p);
          const sub = [
            p.cohort_label,
            p.enrollment_start_date && p.enrollment_end_date
              ? `${new Date(p.enrollment_start_date).toLocaleDateString('he-IL')}–${new Date(p.enrollment_end_date).toLocaleDateString('he-IL')}`
              : null,
            !p.cohort_label && !p.enrollment_start_date ? `נרכש ${new Date(p.created_at).toLocaleDateString('he-IL')}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
              <div>
                <span>{p.courses?.name || 'קורס'}{p.courses?.code ? ` (${p.courses.code})` : ''}</span>
                {sub && <div style={{ fontSize: 11, color: 'var(--k-text-muted, #9b9b9b)', marginTop: 1 }}>{sub}</div>}
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
                background: badge.tone === 'ok' ? 'var(--k-ok-bg, #e8f5e9)' : 'var(--k-pill-bg, #f0f0f0)',
                color: badge.tone === 'ok' ? 'var(--k-ok-text, #2e7d32)' : 'var(--k-text-muted, #6b6b6b)',
              }}>
                {badge.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
