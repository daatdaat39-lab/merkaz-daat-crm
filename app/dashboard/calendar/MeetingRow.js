'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateMeeting, deleteMeeting } from './actions';

function toIntlPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

function meetingMessage(m) {
  const dateStr = new Date(m.meeting_date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = m.meeting_time?.slice(0, 5);
  return `שלום ${m.contacts?.first || ''}, נקבעה לך פגישה ב${dateStr} בשעה ${timeStr} (${m.type}${m.location ? `, ${m.location}` : ''}). מרכז דעת`;
}

export default function MeetingRow({ m, compact }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const boundUpdate = updateMeeting.bind(null, m.id);
  const message = meetingMessage(m);
  const phoneIntl = toIntlPhone(m.contacts?.phone);

  function handleSubmit(formData) {
    setError(null);
    startTransition(async () => {
      const res = await boundUpdate(formData);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm('למחוק את הפגישה?')) return;
    startTransition(() => deleteMeeting(m.id));
  }

  return (
    <div style={{
      background: compact ? '#f9f9f9' : '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px',
      opacity: compact ? 0.85 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, width: 50, direction: 'ltr', textAlign: 'left', flexShrink: 0 }}>
          {m.meeting_time?.slice(0, 5)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/dashboard/contacts/${m.contacts?.id}`} style={{ fontSize: 13, fontWeight: 500, textDecoration: 'none', color: 'inherit' }}>
            {m.contacts?.first} {m.contacts?.last}
          </Link>
          <div style={{ fontSize: 11, color: '#9b9b9b' }}>
            {m.type}{m.location ? ` · ${m.location}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {m.contacts?.email && (
            <a
              href={`mailto:${m.contacts.email}?subject=${encodeURIComponent('פרטי פגישה - מרכז דעת')}&body=${encodeURIComponent(message)}`}
              title="שליחה במייל"
              style={iconStyle()}
            >✉️</a>
          )}
          {phoneIntl && (
            <a
              href={`https://wa.me/${phoneIntl}?text=${encodeURIComponent(message)}`}
              target="_blank" rel="noreferrer"
              title="שליחה בוואטסאפ"
              style={iconStyle()}
            >💬</a>
          )}
          {m.contacts?.phone && (
            <a
              href={`sms:${m.contacts.phone}?body=${encodeURIComponent(message)}`}
              title="שליחה ב-SMS"
              style={iconStyle()}
            >💌</a>
          )}
          <button onClick={() => setEditing((v) => !v)} style={{ ...iconStyle(), border: '1px solid #e5e5e5' }}>✎</button>
          <button onClick={handleDelete} disabled={isPending} style={{ ...iconStyle(), border: '1px solid #e5e5e5', color: 'var(--danger, #a3392f)' }}>🗑</button>
        </div>
      </div>

      {editing && (
        <form action={handleSubmit} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="date" name="meeting_date" defaultValue={m.meeting_date} required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <input type="time" name="meeting_time" defaultValue={m.meeting_time?.slice(0, 5)} required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <select name="type" defaultValue={m.type} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}>
            <option value="פרונטלי">פרונטלי</option>
            <option value="טלפוני">טלפוני</option>
            <option value="זום">זום</option>
          </select>
          <input name="location" placeholder="מיקום" defaultValue={m.location || ''} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <input name="notes" placeholder="הערות" defaultValue={m.notes || ''} style={{ flex: 1, minWidth: 140, border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <button type="submit" disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
            שמירה
          </button>
          {error && <div style={{ width: '100%', color: 'var(--danger, #a3392f)', fontSize: 12 }}>שגיאה: {error}</div>}
        </form>
      )}
    </div>
  );
}

function iconStyle() {
  return {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, border: 'none', background: '#f2f2f2', fontSize: 13, cursor: 'pointer', textDecoration: 'none',
  };
}
