'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadCourse, openAdditionalCourseLead } from '../actions';

const inputStyle = { fontSize: 12, border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 6px', background: 'var(--k-surface)', color: 'var(--k-text)' };

// בורר-קורס לתהליך הפתוח - מוצג בקוביית-הסיכום (GenericStatsTile) וגם
// בכרטיס "תהליך ראשי" בטאב "פעילות נוכחית" - לא בפין-המחלקה למעלה
// (הועבר-מכוון משם - שם-המחלקה בפין נשאר-קבוע, לא-תלוי-בקורס).
// compact=true (קוביית-הסיכום) - בלי התווית "קורס:" (כבר-יש-תווית-Block
// משלה למעלה) ובלי ה-▾ (יש-כבר-חץ-גלוי-מספיק בלי-להוסיף-אחד-נוסף).
export default function LeadCourseSwitcher({ department, courses = [], contactId, frozen, compact = false }) {
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newCourseId, setNewCourseId] = useState('');
  const [newReason, setNewReason] = useState('התעניינות ברישום ללימודים');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSwitchCourse(courseId) {
    setError(null);
    startTransition(async () => {
      const res = await updateLeadCourse(department.id, courseId || null);
      // תיקון-באג: עד-כה השגיאה (למשל-התנגשות-עם-ליד-פתוח-קיים-לאותו-
      // קורס) לא-נבדקה-בכלל כאן - כישלון-בשרת היה-נראה-כהצלחה-שקטה
      // (התפריט-נסגר, שום-דבר-לא-השתנה-בפועל).
      if (res?.error) { setError(res.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  function handleOpenAdditional() {
    setError(null);
    if (!newCourseId) { setError('יש לבחור קורס'); return; }
    startTransition(async () => {
      const res = await openAdditionalCourseLead(contactId, department.workspaceId, newCourseId, newReason);
      if (res?.error) { setError(res.error); return; }
      setAddingNew(false);
      setNewCourseId('');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div style={{ position: 'relative', marginTop: compact ? 0 : 4 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={frozen}
        style={compact ? {
          fontFamily: 'var(--k-font-display)', background: 'none', border: 'none', padding: 0, fontSize: 16, color: 'var(--k-accent)',
          cursor: frozen ? 'default' : 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
        } : {
          background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--k-text-muted)',
          cursor: frozen ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {compact ? (department.courseName || 'לא נבחר') : (
          <>קורס: <b style={{ color: 'var(--k-text)' }}>{department.courseName || 'לא נבחר'}</b> ▾</>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, minWidth: 230,
          border: '1px solid var(--k-border)', borderRadius: 10, background: 'var(--k-surface)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 60, padding: 8,
        }}>
          <div style={{ fontSize: 10, color: 'var(--k-text-muted)', marginBottom: 4 }}>מעבר לקורס אחר (לליד הזה)</div>
          {error && !addingNew && <div style={{ fontSize: 11, color: 'var(--k-danger-text)', marginBottom: 4 }}>{error}</div>}
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSwitchCourse(c.id)}
              disabled={isPending}
              style={{
                display: 'block', width: '100%', textAlign: 'right', borderRadius: 6, padding: '6px 8px', fontSize: 12.5, cursor: 'pointer',
                background: c.id === department.courseId ? 'var(--k-pill-bg)' : 'none', border: 'none', color: 'var(--k-text)',
              }}
            >
              {c.name}{c.id === department.courseId ? ' ✓' : ''}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--k-border)', margin: '6px 0' }} />
          {!addingNew ? (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', padding: '6px 8px', fontSize: 12.5, cursor: 'pointer', color: 'var(--k-accent)', fontWeight: 600 }}
            >
              + פתיחת ליד לקורס נוסף
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 4px 0' }}>
              <select value={newCourseId} onChange={(e) => setNewCourseId(e.target.value)} style={inputStyle}>
                <option value="">בחר קורס...</option>
                {courses.filter((c) => c.id !== department.courseId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="מהות הפנייה" style={inputStyle} />
              {error && <div style={{ fontSize: 11, color: 'var(--k-danger-text)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={handleOpenAdditional} disabled={isPending} style={{ flex: 1, background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 0', fontSize: 11.5, cursor: 'pointer' }}>
                  פתיחה
                </button>
                <button type="button" onClick={() => { setAddingNew(false); setError(null); }} style={{ flex: 1, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 0', fontSize: 11.5, cursor: 'pointer', color: 'var(--k-text)' }}>
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
