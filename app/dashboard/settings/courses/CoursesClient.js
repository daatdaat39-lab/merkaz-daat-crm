'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCourse, updateCourse, createCourseTrack, updateCourseTrack,
  createCourseFormField, updateCourseFormField, reorderCourseFormField,
} from './actions';
import { generateFieldKey } from '../../lib/fieldKey';

// מערכת-טפסים-בסיסית (migration 0182) - רשימה-אחת-מסודרת, לא-3
// רשימות-נפרדות (שאלות/מסמכים/חתימה) - type קובע-את-הווידג'ט, sort_order
// קובע-את-המיקום בטופס בפועל (ליד/קישור-אישי). 'file'/'signature' לא-
// צריכים-options, ולהבדיל-מ-type='select' לא-נבדקים-ב-UI-ההוספה.
const FIELD_TYPES = [
  { value: 'text', label: 'טקסט' },
  { value: 'number', label: 'מספר' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'בחירה מרשימה' },
  { value: 'file', label: 'העלאת מסמך' },
  { value: 'signature', label: 'חתימה' },
];

const DURATION_LABELS = {
  fixed_dates: 'תאריכים קבועים (מחזור)',
  self_paced: 'דיגיטלי - לימוד עצמי (אין תאריך-סיום)',
  duration_from_purchase: 'משך קבוע מרגע הרכישה',
};

// נשארו-רק-2: "מילוי טפסי רישום" (קישור-חיצוני, מושג-נפרד-לגמרי משדות-
// הטופס-הפנימיים) ו"הסדר תשלומים". "העלאת מסמכים"/"חתימות" התייתרו -
// נגזרים-אוטומטית-מקיום שדה-type='file'/'signature' פעיל ברשימה למטה.
const CHECKLIST_ITEMS = [
  { key: 'checklistFormsEnabled', dbKey: 'checklist_forms_enabled', label: 'מילוי טפסי רישום (קישור חיצוני)' },
  { key: 'checklistPaymentEnabled', dbKey: 'checklist_payment_enabled', label: 'הסדר תשלומים' },
];

export default function CoursesClient({ courses, tracks = [], formFields = [] }) {
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
        registrationFormUrl: formData.get('registrationFormUrl'),
        signatureTemplateUrl: formData.get('signatureTemplateUrl'),
        paymentPageUrl: formData.get('paymentPageUrl'),
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
          <CourseRow
            key={c.id}
            course={c}
            tracks={tracks.filter((t) => t.course_id === c.id)}
            formFields={formFields.filter((f) => f.course_id === c.id)}
          />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <LabeledInput label="קישור לטופס רישום חיצוני (ברירת-מחדל לליד)" name="registrationFormUrl" />
            <LabeledInput label="קישור לתבנית חתימה דיגיטלית (ברירת-מחדל לליד)" name="signatureTemplateUrl" />
            <LabeledInput label="קישור לדף תשלום חיצוני (Kesher) - ברירת-מחדל לליד" name="paymentPageUrl" />
          </div>
          {/* הקישור החיצוני לטופס רישום כבוי כברירת מחדל: יש לנו שדות טופס משלנו
              וקישור אישי ללקוח (course_form_fields, /register/[token]). */}
          <ChecklistCheckboxes defaults={{ checklistFormsEnabled: false, checklistPaymentEnabled: true }} />
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

function CourseRow({ course, tracks, formFields }) {
  const [editing, setEditing] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [showFields, setShowFields] = useState(false);
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
        registrationFormUrl: formData.get('registrationFormUrl'),
        signatureTemplateUrl: formData.get('signatureTemplateUrl'),
        paymentPageUrl: formData.get('paymentPageUrl'),
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <LabeledInput label="קישור לטופס רישום חיצוני (ברירת-מחדל לליד)" name="registrationFormUrl" defaultValue={course.registration_form_url} />
          <LabeledInput label="קישור לתבנית חתימה דיגיטלית (ברירת-מחדל לליד)" name="signatureTemplateUrl" defaultValue={course.signature_template_url} />
          <LabeledInput label="קישור לדף תשלום חיצוני (Kesher) - ברירת-מחדל לליד" name="paymentPageUrl" defaultValue={course.payment_page_url} />
        </div>
        <ChecklistCheckboxes defaults={{
          checklistFormsEnabled: course.checklist_forms_enabled,
          checklistPaymentEnabled: course.checklist_payment_enabled,
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
          <button type="button" onClick={() => setShowFields((v) => !v)} style={secondaryBtn}>
            {showFields ? 'סגירת שדות הטופס' : `שדות הטופס (${formFields.length})`}
          </button>
          <button type="button" onClick={() => setEditing(true)} style={secondaryBtn}>עריכה</button>
          <button type="button" onClick={toggleActive} disabled={isPending} style={secondaryBtn}>{course.is_active ? 'השבתה' : 'הפעלה'}</button>
        </div>
      </div>
      {showTracks && <TrackManager courseId={course.id} tracks={tracks} />}
      {showFields && <FormFieldsManager courseId={course.id} fields={formFields} />}
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

  function saveDate(field, value) {
    startTransition(async () => {
      const res = await updateCourseTrack(track.id, { [field]: value });
      if (!res?.error) router.refresh();
    });
  }

  const dateInput = { ...inputStyle, width: 138, padding: '3px 6px', fontSize: 12 };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%', marginBottom: 4 }}>
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
      {/* תאריכי המסלול - התחלה משמשת למעבר האוטומטי "נרשם" <- "תלמיד פעיל" */}
      <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        התחלה
        <input type="date" defaultValue={track.start_date || ''} onChange={(e) => saveDate('startDate', e.target.value)} disabled={isPending} style={dateInput} />
      </label>
      <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        סיום
        <input type="date" defaultValue={track.end_date || ''} onChange={(e) => saveDate('endDate', e.target.value)} disabled={isPending} style={dateInput} />
      </label>
    </span>
  );
}

// רשימת-שדות-הטופס המאוחדת (migration 0182) - סדר חופשי, כל-שדה עם-
// type משלו (טקסט/מספר/תאריך/בחירה/קובץ/חתימה) - זה-מה-שהופך "3
// רשימות-קבועות" ל"טופס-אמיתי-אחד" (ר' דיון "מערכת-טפסים בסיסית").
function FormFieldsManager({ courseId, fields }) {
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState({ fieldKey: '', label: '', type: 'text', optionsText: '', required: false });
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const options = newField.type === 'select' ? newField.optionsText.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const res = await createCourseFormField(courseId, {
        fieldKey: newField.fieldKey, label: newField.label, type: newField.type, options, required: newField.required,
      });
      if (res?.error) { setError(res.error); return; }
      setNewField({ fieldKey: '', label: '', type: 'text', optionsText: '', required: false });
      setAdding(false);
      router.refresh();
    });
  }

  function handleReorder(fieldId, direction) {
    startTransition(async () => {
      const res = await reorderCourseFormField(fieldId, direction);
      if (!res?.error) router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
        שדות-הטופס לקורס זה, בסדר-שבו-יוצגו (שאלות/מסמכים/חתימה - ניתן לשלב ולסדר מחדש עם ▲▼) - מוצגים במסך-הרישום ובקישור-האישי ללקוח
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {fields.map((f, i) => (
          <FieldRow
            key={f.id} field={f} disabled={isPending}
            onMoveUp={i > 0 ? () => handleReorder(f.id, 'up') : null}
            onMoveDown={i < fields.length - 1 ? () => handleReorder(f.id, 'down') : null}
          />
        ))}
        {fields.length === 0 && !adding && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>אין עדיין שדות בטופס - אפשר לדלג אם אין צורך.</span>
        )}
      </div>
      {adding ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <input placeholder="מפתח טכני" value={newField.fieldKey}
            onChange={(e) => setNewField((p) => ({ ...p, fieldKey: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
          <button
            type="button"
            onClick={() => setNewField((p) => ({ ...p, fieldKey: generateFieldKey(fields.map((f) => f.field_key)) }))}
            title="יצירת מפתח טכני אוטומטי שעדיין לא תפוס"
            style={secondaryBtn}
          >
            🎲 אוטומטי
          </button>
          <input placeholder="תווית" value={newField.label}
            onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))} style={{ ...inputStyle, width: 220 }} />
          <select value={newField.type} onChange={(e) => setNewField((p) => ({ ...p, type: e.target.value }))} style={inputStyle}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {newField.type === 'select' && (
            <input placeholder="אפשרויות, מופרדות בפסיק" value={newField.optionsText}
              onChange={(e) => setNewField((p) => ({ ...p, optionsText: e.target.value }))} style={{ ...inputStyle, width: 220 }} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={newField.required} onChange={(e) => setNewField((p) => ({ ...p, required: e.target.checked }))} />
            שדה חובה (חוסם סיום-רישום)
          </label>
          <button type="button" onClick={handleAdd} disabled={isPending || !newField.fieldKey.trim() || !newField.label.trim()} style={primaryBtn}>
            {isPending ? 'שומר...' : 'הוספה'}
          </button>
          <button type="button" onClick={() => setAdding(false)} style={secondaryBtn}>ביטול</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={secondaryBtn}>+ שדה חדש</button>
      )}
    </div>
  );
}

function FieldRow({ field, disabled, onMoveUp, onMoveDown }) {
  const [label, setLabel] = useState(field.label);
  const [optionsText, setOptionsText] = useState(field.type === 'select' ? (field.options || []).join(', ') : '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(patch) {
    startTransition(async () => {
      const res = await updateCourseFormField(field.id, patch);
      if (!res?.error) router.refresh();
    });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 10px',
      border: '1px solid var(--border)', borderRadius: 6, opacity: field.is_active ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button type="button" onClick={onMoveUp} disabled={!onMoveUp || disabled} style={reorderBtn} title="הזזה למעלה">▲</button>
        <button type="button" onClick={onMoveDown} disabled={!onMoveDown || disabled} style={reorderBtn} title="הזזה למטה">▼</button>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 4, padding: '2px 6px' }}>
        {FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type}
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label !== field.label) save({ label: label.trim() }); }}
        disabled={disabled}
        style={{ ...inputStyle, width: 200 }}
      />
      {field.type === 'select' && (
        <input
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          onBlur={() => save({ options: optionsText.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="אפשרויות, מופרדות בפסיק"
          disabled={disabled}
          style={{ ...inputStyle, width: 200 }}
        />
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!field.required} disabled={disabled} onChange={(e) => save({ required: e.target.checked })} />
        חובה
      </label>
      <button
        type="button"
        onClick={() => save({ isActive: !field.is_active })}
        disabled={disabled}
        style={{ marginInlineStart: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--text-secondary)' }}
      >
        {field.is_active ? 'השבתה' : 'הפעלה'}
      </button>
    </div>
  );
}

const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
const secondaryBtn = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' };
const reorderBtn = { background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer', lineHeight: '14px' };

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
