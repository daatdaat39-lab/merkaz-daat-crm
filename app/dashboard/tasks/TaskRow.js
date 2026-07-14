'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toggleTask, updateTask } from './actions';

const REMIND_OPTIONS = [
  { value: '', label: 'ללא תזכורת' },
  { value: '15', label: '15 דקות לפני' },
  { value: '30', label: '30 דקות לפני' },
  { value: '60', label: 'שעה לפני' },
  { value: '1440', label: 'יום לפני' },
];

function dueDateTime(t) {
  if (!t.due_date) return null;
  return new Date(`${t.due_date}T${t.due_time || '23:59'}`);
}

export default function TaskRow({ t, contacts }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  const due = dueDateTime(t);
  const now = new Date();
  const overdue = !t.done && due && due.getTime() < now.getTime();
  const reminderDue = !t.done && !overdue && due && t.remind_minutes_before
    && (due.getTime() - now.getTime()) <= t.remind_minutes_before * 60000;

  const boundUpdate = updateTask.bind(null, t.id);

  function handleSubmit(formData) {
    setError(null);
    startTransition(async () => {
      const res = await boundUpdate(formData);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  function handleToggle() {
    setError(null);
    const fd = new FormData();
    fd.set('task_id', t.id);
    fd.set('done', (!t.done).toString());
    startTransition(async () => {
      const res = await toggleTask(fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px',
      borderColor: overdue ? 'var(--danger, #a3392f)' : '#e5e5e5',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={handleToggle}
          disabled={isPending}
          style={{
            width: 18, height: 18, borderRadius: 4, border: '1px solid #d0d0d0',
            background: t.done ? '#16a34a' : '#fff', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0,
          }}
        >
          {t.done ? '✓' : ''}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9b9b9b' : '#0a0a0a' }}>
            {t.title}
          </div>
          <div style={{ fontSize: 11, color: overdue ? 'var(--danger, #a3392f)' : '#9b9b9b', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {t.contacts && (
              <Link href={`/dashboard/contacts/${t.contacts.id}`} style={{ color: 'inherit' }}>
                {t.contacts.first} {t.contacts.last}
              </Link>
            )}
            {t.due_date && (
              <span>
                יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}{t.due_time ? ` ${t.due_time.slice(0, 5)}` : ''}
              </span>
            )}
            {overdue && <span style={{ fontWeight: 600 }}>⚠ עבר המועד</span>}
            {reminderDue && <span style={{ color: '#a4691f', fontWeight: 600 }}>🔔 תזכורת</span>}
          </div>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          style={{ background: 'none', border: 'none', color: '#9b9b9b', fontSize: 12, cursor: 'pointer' }}
        >
          {editing ? 'סגירה' : '✎ עריכה'}
        </button>
      </div>

      {error && !editing && (
        <div style={{ marginTop: 8, color: 'var(--danger, #a3392f)', fontSize: 12 }}>שגיאה: {error}</div>
      )}

      {editing && (
        <form action={handleSubmit} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input name="title" defaultValue={t.title} required style={{ flex: 1, minWidth: 160, border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <select name="contact_id" defaultValue={t.contacts?.id || ''} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}>
            <option value="">ללא איש קשר</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.first} {c.last}</option>)}
          </select>
          <input type="date" name="due_date" defaultValue={t.due_date || ''} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <input type="time" name="due_time" defaultValue={t.due_time ? t.due_time.slice(0, 5) : ''} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <select name="remind_minutes_before" defaultValue={t.remind_minutes_before || ''} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}>
            {REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="submit" disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
            שמירה
          </button>
          {error && <div style={{ width: '100%', color: 'var(--danger, #a3392f)', fontSize: 12 }}>שגיאה: {error}</div>}
        </form>
      )}
    </div>
  );
}
