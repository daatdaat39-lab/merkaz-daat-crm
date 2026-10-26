'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCourse, updateCourse } from './actions';

const DURATION_LABELS = {
  fixed_dates: 'תאריכים קבועים (מחזור)',
  self_paced: 'דיגיטלי - לימוד עצמי (אין תאריך-סיום)',
  duration_from_purchase: 'משך קבוע מרגע הרכישה',
};

export default function CoursesClient({ courses }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate(formData) {
    setError(null);
    startTransition(async () => {
      const res = await createCourse({
        name: formData.get('name'), code: formData.get('code'), description: formData.get('description'),
        price: formData.get('price'), durationType: formData.get('durationType'), durationDays: formData.get('durationDays'),
      });
      if (res?.error) { setError(res.error); return; }
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 12 }}>שגיאה: {error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {courses.map((c) => <CourseRow key={c.id} course={c} />)}
        {courses.length === 0 && !adding && (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>אין עדיין קורסים בקטלוג.</div>
        )}
      </div>

      {adding ? (
        <form action={handleCreate} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <LabeledInput label="שם קורס *" name="name" required />
            <LabeledInput label="קוד" name="code" />
            <LabeledInput label="מחיר" name="price" type="number" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>משך הקורס</div>
              <select name="durationType" defaultValue="fixed_dates" style={inputStyle}>
                {Object.entries(DURATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <LabeledInput label="מספר ימים (רק עבור משך קבוע מרכישה)" name="durationDays" type="number" />
          </div>
          <LabeledTextarea label="תיאור" name="description" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={isPending} style={primaryBtn}>{isPending ? 'שומר...' : 'הוספת קורס'}</button>
            <button type="button" onClick={() => setAdding(false)} style={secondaryBtn}>ביטול</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={primaryBtn}>+ קורס חדש</button>
      )}
    </div>
  );
}

function CourseRow({ course }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateCourse(course.id, {
        name: formData.get('name'), code: formData.get('code'), description: formData.get('description'),
        price: formData.get('price'), durationType: formData.get('durationType'), durationDays: formData.get('durationDays'),
      });
      if (res?.error) { setError(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const res = await updateCourse(course.id, { isActive: !course.is_active });
      if (!res?.error) router.refresh();
    });
  }

  if (editing) {
    return (
      <form action={handleSave} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 14 }}>
        {error && <div style={{ color: '#b23b2f', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <LabeledInput label="שם קורס" name="name" defaultValue={course.name} />
          <LabeledInput label="קוד" name="code" defaultValue={course.code} />
          <LabeledInput label="מחיר" name="price" type="number" defaultValue={course.price} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>משך הקורס</div>
            <select name="durationType" defaultValue={course.duration_type || 'fixed_dates'} style={inputStyle}>
              {Object.entries(DURATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <LabeledInput label="מספר ימים" name="durationDays" type="number" defaultValue={course.duration_days} />
        </div>
        <LabeledTextarea label="תיאור" name="description" defaultValue={course.description} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="submit" disabled={isPending} style={primaryBtn}>{isPending ? 'שומר...' : 'שמירה'}</button>
          <button type="button" onClick={() => setEditing(false)} style={secondaryBtn}>ביטול</button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', opacity: course.is_active ? 1 : 0.55 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>
          {course.name} {course.code && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({course.code})</span>}
          {!course.is_active && <span style={{ marginInlineStart: 8, fontSize: 11, color: '#b23b2f' }}>לא פעיל</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {course.price != null && `₪${Number(course.price).toLocaleString('he-IL')} · `}
          {DURATION_LABELS[course.duration_type] || DURATION_LABELS.fixed_dates}
          {course.duration_type === 'duration_from_purchase' && course.duration_days ? ` (${course.duration_days} ימים)` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={() => setEditing(true)} style={secondaryBtn}>עריכה</button>
        <button type="button" onClick={toggleActive} disabled={isPending} style={secondaryBtn}>{course.is_active ? 'השבתה' : 'הפעלה'}</button>
      </div>
    </div>
  );
}

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
const secondaryBtn = { background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' };

function LabeledInput({ label, ...props }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
      <input {...props} style={inputStyle} />
    </div>
  );
}

function LabeledTextarea({ label, ...props }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
      <textarea {...props} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
    </div>
  );
}
