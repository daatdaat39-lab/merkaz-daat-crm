'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCourse, updateCourse, createCourseTrack, updateCourseTrack } from './actions';

const DURATION_LABELS = {
  fixed_dates: 'תאריכים קבועים (מחזור)',
  self_paced: 'דיגיטלי - לימוד עצמי (אין תאריך-סיום)',
  duration_from_purchase: 'משך קבוע מרגע הרכישה',
};

// 3 הפריטים-הקבועים לצ'קליסט "פרטים טכניים" (מסך-הטיפול-בליד) - כל-קורס
// בוחר אילו רלוונטיים-לו (ברירת-מחדל: כולם דלוקים, ר' migration 0173).
const CHECKLIST_ITEMS = [
  { key: 'checklistFormsEnabled', dbKey: 'checklist_forms_enabled', label: 'מילוי טפסי רישום' },
  { key: 'checklistPaymentEnabled', dbKey: 'checklist_payment_enabled', label: 'הסדר תשלומים' },
  { key: 'checklistSignaturesEnabled', dbKey: 'checklist_signatures_enabled', label: 'חתימות' },
];

export default function CoursesClient({ courses, tracks = [] }) {
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
        checklistFormsEnabled: formData.get('checklistFormsEnabled') === 'on',
        checklistPaymentEnabled: formData.get('checklistPaymentEnabled') === 'on',
        checklistSignaturesEnabled: formData.get('checklistSignaturesEnabled') === 'on',
      });
      if (res?.error) { setError(res.error); return; }
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>שגיאה: {error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {courses.map((c) => (
          <CourseRow key={c.id} course={c} tracks={tracks.filter((t) => t.course_id === c.id)} />
        ))}
        {courses.length === 0 && !adding && (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>אין עדיין קורסים בקטלוג.</div>
        )}
      </div>

      {adding ? (
        <form action={handleCreate} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
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
          <ChecklistCheckboxes defaults={{ checklistFormsEnabled: true, checklistPaymentEnabled: true, checklistSignaturesEnabled: true }} />
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

function ChecklistCheckboxes({ defaults }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 5 }}>
        פריטי-צ'קליסט רלוונטיים לקורס זה (מוצגים במסך "פרטים טכניים" בטיפול-בליד)
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" name={item.key} defaultChecked={defaults[item.key] !== false} />
            {item.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function CourseRow({ course, tracks }) {
  const [editing, setEditing] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateCourse(course.id, {
        name: formData.get('name'), code: formData.get('code'), description: formData.get('description'),
        price: formData.get('price'), durationType: formData.get('durationType'), durationDays: formData.get('durationDays'),
        checklistFormsEnabled: formData.get('checklistFormsEnabled') === 'on',
        checklistPaymentEnabled: formData.get('checklistPaymentEnabled') === 'on',
        checklistSignaturesEnabled: formData.get('checklistSignaturesEnabled') === 'on',
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
      <form action={handleSave} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
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
        <ChecklistCheckboxes defaults={{
          checklistFormsEnabled: course.checklist_forms_enabled,
          checklistPaymentEnabled: course.checklist_payment_enabled,
          checklistSignaturesEnabled: course.checklist_signatures_enabled,
        }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="submit" disabled={isPending} style={primaryBtn}>{isPending ? 'שומר...' : 'שמירה'}</button>
          <button type="button" onClick={() => setEditing(false)} style={secondaryBtn}>ביטול</button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', opacity: course.is_active ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>
            {course.name} {course.code && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({course.code})</span>}
            {!course.is_active && <span style={{ marginInlineStart: 8, fontSize: 11, color: 'var(--red)' }}>לא פעיל</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {course.price != null && `₪${Number(course.price).toLocaleString('he-IL')} · `}
            {DURATION_LABELS[course.duration_type] || DURATION_LABELS.fixed_dates}
            {course.duration_type === 'duration_from_purchase' && course.duration_days ? ` (${course.duration_days} ימים)` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => setShowTracks((v) => !v)} style={secondaryBtn}>
            {showTracks ? 'סגירת מסלולים' : `ניהול מסלולים (${tracks.length})`}
          </button>
          <button type="button" onClick={() => setEditing(true)} style={secondaryBtn}>עריכה</button>
          <button type="button" onClick={toggleActive} disabled={isPending} style={secondaryBtn}>{course.is_active ? 'השבתה' : 'הפעלה'}</button>
        </div>
      </div>
      {showTracks && <TrackManager courseId={course.id} tracks={tracks} />}
    </div>
  );
}

function TrackManager({ courseId, tracks }) {
  const [addingTrack, setAddingTrack] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd() {
    if (!newLabel.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createCourseTrack(courseId, newLabel);
      if (res?.error) { setError(res.error); return; }
      setNewLabel('');
      setAddingTrack(false);
      router.refresh();
    });
  }

  function toggleTrackActive(track) {
    startTransition(async () => {
      const res = await updateCourseTrack(track.id, { isActive: !track.is_active });
      if (!res?.error) router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
        מסלולים לקורס זה (לדוגמה: בוקר/ערב/זום) - נבחרים לכל-ליד במסך "פרטים טכניים"
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {tracks.map((t) => (
          <TrackChip key={t.id} track={t} onToggleActive={() => toggleTrackActive(t)} disabled={isPending} />
        ))}
        {tracks.length === 0 && !addingTrack && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>אין עדיין מסלולים - אפשר לדלג אם אין צורך.</span>
        )}
      </div>
      {addingTrack ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="שם מסלול, למשל ערב"
            style={{ ...inputStyle, width: 180 }}
          />
          <button type="button" onClick={handleAdd} disabled={isPending} style={primaryBtn}>{isPending ? 'שומר...' : 'הוספה'}</button>
          <button type="button" onClick={() => { setAddingTrack(false); setNewLabel(''); }} style={secondaryBtn}>ביטול</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAddingTrack(true)} style={secondaryBtn}>+ מסלול חדש</button>
      )}
    </div>
  );
}

function TrackChip({ track, onToggleActive, disabled }) {
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(track.label);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleRename() {
    if (!label.trim() || label === track.label) { setRenaming(false); return; }
    startTransition(async () => {
      const res = await updateCourseTrack(track.id, { label });
      if (!res?.error) router.refresh();
      setRenaming(false);
    });
  }

  if (renaming) {
    return (
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          autoFocus
          style={{ ...inputStyle, width: 120, padding: '4px 8px' }}
        />
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: track.is_active ? 'var(--bg-secondary, #f4f4f5)' : 'transparent',
        border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12,
        opacity: track.is_active ? 1 : 0.5,
      }}
    >
      <span onClick={() => setRenaming(true)} style={{ cursor: 'pointer' }}>{track.label}</span>
      <button
        type="button"
        onClick={onToggleActive}
        disabled={disabled || isPending}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', padding: 0 }}
        title={track.is_active ? 'השבתה' : 'הפעלה'}
      >
        {track.is_active ? '✕' : '↺'}
      </button>
    </span>
  );
}

const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
const secondaryBtn = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' };

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
