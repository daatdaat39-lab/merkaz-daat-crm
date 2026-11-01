'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadCourse, openAdditionalCourseLead } from '../actions';

const inputStyle = { fontSize: 12, border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 6px', background: 'var(--k-surface)', color: 'var(--k-text)' };

// פין-מחלקה בודד בראש כרטיס-איש-הקשר - למחלקות-sells_courses=true
// (ר' migration 0164, "ליד-פר-קורס") הכותרת-הראשית-בפין היא *שם-הקורס*
// עצמו (לא שם-המחלקה), עם שם-המחלקה כתת-כותרת-קטנה מעליה, וחץ-▾ נפרד
// שפותח רשימה-נפתחת למעבר-קורס/פתיחת-ליד-נוסף - כדי שריבוי-קורסים לא
// יציף את שורת-הפינים (אושר בסקיצה, Artifact HZtmkQXAwNyrQPwAW4cQpY).
// מחלקות-רגילות (sells_courses=false) מקבלות בדיוק את הפין הישן - שם-
// המחלקה בלבד, בלי ה-▾.
export default function CoursePinSwitcher({ department, isActive, onSelect, courses = [], contactId, frozen }) {
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newCourseId, setNewCourseId] = useState('');
  const [newReason, setNewReason] = useState('התעניינות ברישום ללימודים');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSwitchCourse(courseId) {
    setOpen(false);
    startTransition(async () => {
      await updateLeadCourse(department.id, courseId || null);
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

  const pinStyle = {
    fontFamily: 'var(--k-font-display)',
    border: '1px solid ' + (isActive ? 'var(--k-text)' : 'var(--k-border)'),
    background: isActive ? 'var(--k-text)' : 'var(--k-surface)',
    color: isActive ? 'var(--k-bg)' : 'var(--k-text)',
    borderRadius: 8, padding: '4px 13px', fontSize: 12.5, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0, lineHeight: 1.3,
  };

  if (!department.sellsCourses) {
    return (
      <button type="button" onClick={onSelect} style={{ ...pinStyle, flexDirection: 'row', alignItems: 'center' }}>
        {department.workspaceName}
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
        <button type="button" onClick={onSelect} style={pinStyle}>
          <span style={{ fontSize: 9, opacity: 0.75 }}>{department.workspaceName}</span>
          <span>{department.courseName || 'בחירת קורס'}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={frozen}
          title="קורסים נוספים"
          style={{
            background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '0 8px',
            cursor: frozen ? 'default' : 'pointer', fontSize: 10, color: 'var(--k-text-muted)',
          }}
        >
          ▾
        </button>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, minWidth: 230,
          border: '1px solid var(--k-border)', borderRadius: 10, background: 'var(--k-surface)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 60, padding: 8,
        }}>
          <div style={{ fontSize: 10, color: 'var(--k-text-muted)', marginBottom: 4 }}>מעבר לקורס אחר (לליד הזה)</div>
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
