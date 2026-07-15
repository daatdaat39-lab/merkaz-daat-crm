'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import NotConnectedButton from '../../components/NotConnectedButton';

export default function ContactTabs({ meetings, tasks, notes, contactId, toggleTaskAction, updateNotesAction, frozen, inquiries = [], activeDepartmentName, sentEmails = [] }) {
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
    { id: 'documents', label: 'מסמכים' },
    { id: 'recordings', label: 'הקלטות שיחה' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', gap: 18, marginBottom: 16, flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
              היסטוריית פניות{activeDepartmentName ? ` — ${activeDepartmentName}` : ''}
            </div>
            {inquiries.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין פניות רשומות למחלקה זו</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {inquiries.map((inq, i) => (
                <div key={i} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                  <span style={{ color: '#333' }}>{inq.reason}</span>
                  {inq.note && <span style={{ color: '#9b9b9b' }}> — {inq.note}</span>}
                  <span style={{ color: '#c0c0c0' }}> · {new Date(inq.created_at).toLocaleDateString('he-IL')}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
              מיילים שנשלחו
            </div>
            {sentEmails.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>לא נשלחו מיילים למחלקה זו</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sentEmails.map((e) => (
                <div key={e.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                  <div style={{ fontWeight: 500 }}>{e.subject}</div>
                  <div style={{ color: '#9b9b9b', marginTop: 2 }}>
                    מאת {e.from_address} · {new Date(e.sent_at).toLocaleDateString('he-IL')} {new Date(e.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
              פגישות
            </div>
            {meetings.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין פעילות עדיין</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          </div>
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

      {tab === 'documents' && (
        <div>
          <div style={{ fontSize: 13, color: '#9b9b9b', marginBottom: 10 }}>אין מסמכים</div>
          <NotConnectedButton
            label="העלאת מסמך"
            icon="📎"
            message="העלאת תעודת בגרות / גיליון ציונים — עדיין לא מחובר"
          />
        </div>
      )}

      {tab === 'recordings' && (
        <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין הקלטות (טלפוניה לא מחוברת)</div>
      )}
    </div>
  );
}
