'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateContact } from '../actions';
import TagPicker from '../TagPicker';

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 };
const labelStyle = { fontSize: 10.5, color: '#9b9b9b', marginBottom: 3, display: 'block' };

export default function ContactEditForm({ contact, existingTags = [] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function handleSubmit(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateContact(contact.id, formData);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={contact.frozen}
        style={{
          background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 14px',
          fontSize: 12.5, cursor: contact.frozen ? 'default' : 'pointer', color: '#0a0a0a', opacity: contact.frozen ? 0.5 : 1,
        }}
      >
        {open ? 'סגירה' : '✎ עריכת פרטים'}
      </button>

      {contact.frozen && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#a3392f' }}>❄ איש הקשר מוקפא — לא ניתן לערוך</div>
      )}

      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}

      {open && !contact.frozen && (
        <form action={handleSubmit} style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><span style={labelStyle}>שם פרטי</span><input name="first" defaultValue={contact.first || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>שם משפחה</span><input name="last" defaultValue={contact.last || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>טלפון</span><input name="phone" defaultValue={contact.phone || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>טלפון נוסף</span><input name="phone2" defaultValue={contact.phone2 || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>מייל</span><input name="email" type="email" defaultValue={contact.email || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>ת.ז / מזהה</span><input name="idnum" defaultValue={contact.idnum || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>תחום/מחלקה</span><input name="dept" defaultValue={contact.dept || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>מקור</span><input name="source" defaultValue={contact.source || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>תאריך לידה</span><input type="date" name="birth_date" defaultValue={contact.birth_date || ''} style={inputStyle} /></div>
          <div>
            <span style={labelStyle}>מגדר</span>
            <select name="gender" defaultValue={contact.gender || ''} style={inputStyle}>
              <option value="">—</option>
              <option value="זכר">זכר</option>
              <option value="נקבה">נקבה</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={labelStyle}>תגיות</span>
            <TagPicker existingTags={existingTags} defaultTags={contact.tags || []} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
              שמירה
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
