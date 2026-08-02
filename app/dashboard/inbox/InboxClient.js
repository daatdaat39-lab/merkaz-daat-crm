'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { markShareRead } from '../contacts/actions';

// תיבת ההודעות - אנשי קשר ששותפו אליי על ידי עמיתים (contact_shares).
// סימון כנקרא קורה גם בלחיצה על שם איש הקשר (לא חוסם את הניווט - ה-Link
// עצמו ממשיך כרגיל, הסימון רץ ברקע) וגם בכפתור ייעודי.
export default function InboxClient({ shares }) {
  const [items, setItems] = useState(shares);
  const [, startTransition] = useTransition();

  function handleOpen(id) {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, readAt: s.readAt || new Date().toISOString() } : s)));
    startTransition(() => { markShareRead(id); });
  }

  if (items.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9b9b9b', fontSize: 13.5 }}>אין הודעות</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((s) => (
        <div
          key={s.id}
          style={{
            border: '1px solid ' + (s.readAt ? '#e5e5e5' : '#bfdbfe'),
            background: s.readAt ? '#fff' : '#eff6ff',
            borderRadius: 8, padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              <b>{s.fromName}</b> שיתף/ה איתך את{' '}
              <Link href={`/dashboard/contacts/${s.contactId}`} onClick={() => handleOpen(s.id)} style={{ color: '#1f4d3d', fontWeight: 600 }}>
                {s.contactName}
              </Link>
            </div>
            {!s.readAt && (
              <span style={{ background: '#1d4ed8', color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 600, padding: '2px 8px', flexShrink: 0 }}>
                חדש
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{s.message}</div>
          <div style={{ fontSize: 11, color: '#9b9b9b', marginTop: 6 }}>
            {new Date(s.createdAt).toLocaleDateString('he-IL')} {new Date(s.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {!s.readAt && (
            <button
              onClick={() => handleOpen(s.id)}
              style={{ marginTop: 8, background: 'none', border: 'none', color: '#6b6b6b', fontSize: 11.5, cursor: 'pointer', padding: 0 }}
            >
              ✓ סימון כנקרא
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
