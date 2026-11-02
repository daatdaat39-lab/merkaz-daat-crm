'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { openAdditionalCourseLead } from '../actions';
import { isProcessConcluded } from '../../lib/pipelineVisibility';

const inputStyle = { fontSize: 12, border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 6px', background: 'var(--k-surface)', color: 'var(--k-text)' };

// רשימת-כל-לידי-הקורס של המחלקה הפעילה - מחליפה-הצגת-קורס-יחיד
// בפין/בקוביית-הסיכום (שהייתה-מבלבלת כש-יש-כמה-לידים-באותה-מחלקה).
// כל שורה = ליד-קורס אחד, עם תגית-שלב-רכה ולחיצה-להפוך-אותו-לליד-הפעיל.
// "+ פתיחת ליד לקורס נוסף" תמיד-בתחתית.
export default function CourseLeadsPanel({ departments = [], activeId, onSelect, courses = [], contactId, workspaceId, frozen, pipeline }) {
  const [addingNew, setAddingNew] = useState(false);
  const [newCourseId, setNewCourseId] = useState('');
  const [newReason, setNewReason] = useState('התעניינות ברישום ללימודים');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const existingCourseIds = new Set(departments.map((d) => d.courseId).filter(Boolean));

  function handleOpenAdditional() {
    setError(null);
    if (!newCourseId) { setError('יש לבחור קורס'); return; }
    startTransition(async () => {
      const res = await openAdditionalCourseLead(contactId, workspaceId, newCourseId, newReason);
      if (res?.error) { setError(res.error); return; }
      setAddingNew(false);
      setNewCourseId('');
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--k-pill-bg)', borderRadius: 12, padding: '10px 10px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {departments.map((d) => {
        const concluded = isProcessConcluded(d.stage, pipeline);
        const label = d.openedProcess === false ? 'לא פעיל' : (pipeline.labels?.[d.stage] || d.stage);
        return (
          <div
            key={d.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: d.id === activeId ? 'var(--k-surface)' : 'none',
              border: d.id === activeId ? '1px solid var(--k-border)' : '1px solid transparent',
              borderRadius: 8, padding: '4px 4px 4px 10px',
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', textAlign: 'right',
              }}
            >
              <span style={{ fontSize: 13, fontFamily: 'var(--k-font-display)', color: 'var(--k-text)' }}>
                {d.courseName || 'ליד כללי'}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 100,
                background: concluded ? 'var(--k-ok-bg)' : 'var(--k-pill-bg)',
                color: concluded ? 'var(--k-ok-text)' : 'var(--k-text-muted)',
                border: concluded ? 'none' : '1px solid var(--k-border)',
              }}>
                {label}
              </span>
            </button>
            {/* מעבר-למסך-הטיפול-הייעודי-בליד (תסריטים+ציר-זמן+המרה) -
                נפרד-מהלחיצה-על-השורה (שרק-מחליפה-איזו-מחלקה-פעילה-
                בכרטיס) - אותו-דפוס-כמו "טיפול בליד" בלוח-הלידים. */}
            <Link
              href={`/dashboard/sales/leads/${d.id}`}
              style={{
                fontSize: 11, fontWeight: 600, color: 'var(--k-accent)', textDecoration: 'none',
                padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              טיפול בליד ←
            </Link>
          </div>
        );
      })}

      {!addingNew ? (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={frozen}
          style={{ textAlign: 'right', background: 'none', border: 'none', padding: '4px 10px', fontSize: 12.5, cursor: frozen ? 'default' : 'pointer', color: 'var(--k-accent)', fontWeight: 600 }}
        >
          + פתיחת ליד לקורס נוסף
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 10px' }}>
          <select value={newCourseId} onChange={(e) => setNewCourseId(e.target.value)} style={inputStyle}>
            <option value="">בחר קורס...</option>
            {courses.filter((c) => !existingCourseIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
  );
}
