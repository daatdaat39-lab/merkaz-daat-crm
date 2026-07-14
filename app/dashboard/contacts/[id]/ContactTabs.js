'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ContactTabs({ meetings, tasks, notes, contactId, toggleTaskAction, updateNotesAction, frozen }) {
  const [tab, setTab] = useState('activity');
  const [notesValue, setNotesValue] = useState(notes || '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function handleToggleTask(taskId, done) {
    setError(null);
    const fd = new FormData();
    fd.set('task_id', taskId);
    fd.set('done', done.toString());
    startTransition(async () => {
      const res = await toggleTaskAction(fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleSaveNotes(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateNotesAction(contactId, formData.get('notes'));
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const tabs = [
    { id: 'activity', label: 'פעילות' },
    { id: 'tasks', label: `משימות${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'notes', label: 'הערות' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', gap: 18, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
              fontSize: 13, color: tab === t.id ? '#0a0a0a' : '#9b9b9b',
              borderBottom: tab === t.id ? '2px solid #0a0a0a' : '2px solid transparent',
              fontWeight: tab === t.id ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meetings.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין פעילות עדיין</div>}
          {meetings.map((m) => (
            <div key={m.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title || 'פגישה'}</div>
              <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 3 }}>
                {new Date(m.meeting_date).toLocaleDateString('he-IL')} · {m.meeting_time?.slice(0, 5)} · {m.type}
                {m.location ? ` · ${m.location}` : ''}
              </div>
              {m.notes && <div style={{ fontSize: 12.5, marginTop: 6, color: '#333' }}>{m.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>שגיאה: {error}</div>}
          {tasks.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין משימות</div>}
          {tasks.map((t) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e5e5e5',
              borderRadius: 8, padding: '9px 14px',
            }}>
              <button
                onClick={() => handleToggleTask(t.id, !t.done)}
                disabled={isPending || frozen}
                style={{
                  width: 18, height: 18, borderRadius: 4, border: '1px solid #d0d0d0',
                  background: t.done ? '#16a34a' : '#fff', color: '#fff', fontSize: 11,
                  cursor: frozen ? 'default' : 'pointer', flexShrink: 0, opacity: frozen ? 0.5 : 1,
                }}
              >
                {t.done ? '✓' : ''}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9b9b9b' : '#0a0a0a' }}>
                  {t.title}
                </div>
                {t.due_date && (
                  <div style={{ fontSize: 11, color: '#9b9b9b' }}>יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'notes' && (
        <form action={handleSaveNotes} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>שגיאה: {error}</div>}
          <textarea
            name="notes"
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={8}
            disabled={frozen}
            style={{
              width: '100%', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12,
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            }}
            placeholder="הערות פנימיות על איש הקשר..."
          />
          <button type="submit" disabled={isPending || frozen} style={{
            alignSelf: 'flex-start', background: '#0a0a0a', color: '#fff', border: 'none',
            borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: frozen ? 'default' : 'pointer', opacity: frozen ? 0.5 : 1,
          }}>
            שמירת הערות
          </button>
        </form>
      )}
    </div>
  );
}
