'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const inputStyle = { border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 };

// יצירת אירוע חדש ביומן - פגישה או משימה, נפתח בלחיצה על תא ריק ביומן
// (עם תאריך ברירת מחדל של התא שנלחץ) או מכפתור "+ אירוע חדש" הכללי
export default function EventModal({ date, contacts, members, currentUserId, addMeetingAction, addTaskAction, onClose }) {
  const [type, setType] = useState('meeting');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function handleSubmit(formData) {
    setError(null);
    startTransition(async () => {
      if (type === 'task') {
        const res = await addTaskAction(formData);
        if (res?.error) setError(res.error);
        else { onClose(); router.refresh(); }
      } else {
        const res = await addMeetingAction(formData);
        if (res?.error) setError(res.error);
        else onClose();
      }
    });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 10, padding: 20, width: 420, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>אירוע חדש</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9b9b9b' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setType('meeting')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: type === 'meeting' ? '1px solid #0a0a0a' : '1px solid #e5e5e5',
              background: type === 'meeting' ? '#0a0a0a' : '#fff', color: type === 'meeting' ? '#fff' : '#333',
            }}
          >
            📅 פגישה
          </button>
          <button
            type="button"
            onClick={() => setType('task')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: type === 'task' ? '1px solid #0a0a0a' : '1px solid #e5e5e5',
              background: type === 'task' ? '#0a0a0a' : '#fff', color: type === 'task' ? '#fff' : '#333',
            }}
          >
            ✅ משימה
          </button>
        </div>

        {type === 'meeting' ? (
          <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select name="contact_id" required style={inputStyle}>
              <option value="">בחר איש קשר...</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.first} {c.last}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" name="meeting_date" defaultValue={date} required style={{ ...inputStyle, flex: 1 }} />
              <input type="time" name="meeting_time" required style={{ ...inputStyle, flex: 1 }} />
            </div>
            <select name="type" style={inputStyle}>
              <option value="פרונטלי">פרונטלי</option>
              <option value="טלפוני">טלפוני</option>
              <option value="זום">זום</option>
            </select>
            <input name="location" placeholder="מיקום (אופציונלי)" style={inputStyle} />
            {error && <div style={{ color: 'var(--danger, #a3392f)', fontSize: 12 }}>שגיאה: {error}</div>}
            <button type="submit" disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 0', fontSize: 13, cursor: 'pointer' }}>
              קביעת פגישה
            </button>
          </form>
        ) : (
          <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input name="title" placeholder="משימה חדשה..." required style={inputStyle} />
            <select name="contact_id" style={inputStyle}>
              <option value="">ללא איש קשר</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.first} {c.last}</option>)}
            </select>
            <select name="assigned_to" defaultValue={currentUserId} style={inputStyle}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.id === currentUserId ? `${m.name} (אני)` : m.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" name="due_date" defaultValue={date} style={{ ...inputStyle, flex: 1 }} />
              <input type="time" name="due_time" style={{ ...inputStyle, flex: 1 }} />
            </div>
            <select name="remind_minutes_before" defaultValue="" style={inputStyle}>
              <option value="">ללא תזכורת</option>
              <option value="15">15 דקות לפני</option>
              <option value="30">30 דקות לפני</option>
              <option value="60">שעה לפני</option>
              <option value="1440">יום לפני</option>
            </select>
            {error && <div style={{ color: 'var(--danger, #a3392f)', fontSize: 12 }}>שגיאה: {error}</div>}
            <button type="submit" disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 0', fontSize: 13, cursor: 'pointer' }}>
              הוספת משימה
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
