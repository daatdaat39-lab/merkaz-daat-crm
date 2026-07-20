'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tag } from '../../components/ui';
import { updateContact } from '../actions';
import TagPicker from '../TagPicker';

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 };
const categoryLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '14px 0 8px' };

// כרטיס "פרטים אישיים" - מחולק לקטגוריות (זהות, פרטי קשר, פעילות
// ומעקב), עם עריכה ישירה של השדות עצמם (לא טופס נפרד למטה). לחיצה על
// ✎ הופכת את שורות הזהות/פרטי הקשר לשדות קלט במקום, עם שמירה/ביטול.
export default function PersonalInfoCard({ contact, existingTags, age, hebrewDate, nextMeeting, openTasksCount, agentName, lastActivityAt }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateContact(contact.id, formData);
      if (res?.error) { setError(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>
          פרטים אישיים
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          disabled={contact.frozen}
          title="עריכת פרטים"
          style={{
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, width: 26, height: 26,
            cursor: contact.frozen ? 'default' : 'pointer', fontSize: 12.5, opacity: contact.frozen ? 0.5 : 1,
          }}
        >
          {editing ? '✕' : '✎'}
        </button>
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}

      {editing ? (
        <form action={handleSubmit}>
          <div style={categoryLabel}>זהות</div>
          <Field label="שם פרטי" name="first" defaultValue={contact.first} />
          <Field label="שם משפחה" name="last" defaultValue={contact.last} />
          <Field label="ת.ז / מזהה" name="idnum" defaultValue={contact.idnum} />
          <Field label="תאריך לידה" name="birth_date" type="date" defaultValue={contact.birth_date} />
          <SelectField label="מגדר" name="gender" defaultValue={contact.gender} options={[{ value: '', label: '—' }, { value: 'זכר', label: 'זכר' }, { value: 'נקבה', label: 'נקבה' }]} />
          <Field label="מקור" name="source" defaultValue={contact.source} />

          <div style={categoryLabel}>פרטי קשר</div>
          <Field label="טלפון" name="phone" defaultValue={contact.phone} />
          <Field label="טלפון נוסף" name="phone2" defaultValue={contact.phone2} />
          <Field label="מייל" name="email" type="email" defaultValue={contact.email} />
          <Field label="מייל נוסף" name="email2" type="email" defaultValue={contact.email2} />

          <div style={categoryLabel}>תגיות</div>
          <TagPicker existingTags={existingTags} defaultTags={contact.tags || []} />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" disabled={isPending} style={{ flex: 1, background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>
              שמירה
            </button>
            <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <>
          <div style={categoryLabel}>זהות</div>
          <InfoRow label="ת.ז / מזהה" value={contact.idnum} />
          <InfoRow label="תאריך לידה" value={contact.birth_date ? new Date(contact.birth_date).toLocaleDateString('he-IL') : null} />
          <InfoRow label="גיל" value={age} />
          <InfoRow label="תאריך עברי" value={hebrewDate} />
          <InfoRow label="מגדר" value={contact.gender} />
          <InfoRow label="מקור" value={contact.source} />
          <InfoRow label="נוצר בתאריך" value={new Date(contact.created_at).toLocaleDateString('he-IL')} />

          <div style={categoryLabel}>פרטי קשר</div>
          <InfoRow label="טלפון" value={contact.phone} />
          <InfoRow label="טלפון נוסף" value={contact.phone2} />
          <InfoRow label="מייל" value={contact.email} />
          <InfoRow label="מייל נוסף" value={contact.email2} />

          <div style={categoryLabel}>פעילות ומעקב</div>
          <InfoRow label="פעילות אחרונה" value={lastActivityAt ? new Date(lastActivityAt).toLocaleDateString('he-IL') : null} />
          <InfoRow
            label="פגישה קרובה"
            value={nextMeeting ? `${new Date(nextMeeting.meeting_date).toLocaleDateString('he-IL')} · ${nextMeeting.meeting_time?.slice(0, 5)}` : null}
          />
          <InfoRow label="נציג מטפל" value={agentName} />
          <InfoRow label="משימות פתוחות" value={openTasksCount > 0 ? openTasksCount : null} />

          <div style={{ marginTop: 12 }}>
            {(contact.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '—'}</div>
    </div>
  );
}

function Field({ label, name, type = 'text', defaultValue }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b', marginBottom: 2 }}>{label}</div>
      <input name={name} type={type} defaultValue={defaultValue || ''} style={inputStyle} />
    </div>
  );
}

function SelectField({ label, name, defaultValue, options }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b', marginBottom: 2 }}>{label}</div>
      <select name={name} defaultValue={defaultValue || ''} style={inputStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
