'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { canManageContact, setContactFrozen, deleteContact, mergeContacts, searchContacts } from '../actions';
import NotConnectedButton from '../../components/NotConnectedButton';

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 };

// תפריט ⚙ עם פעולות ניהול על איש הקשר - הקפאה/הפשרה, מיזוג עם כפול,
// ומחיקה (מוקטנת ומוסתרת כאן בכוונה, לא כפתור בולט). כל הפעולות האלה
// דורשות owner/admin של אחת המחלקות של איש הקשר - נבדק דרך canManageContact.
export default function ContactSettingsMenu({ contact }) {
  const [open, setOpen] = useState(false);
  const [canManage, setCanManage] = useState(null); // null = בבדיקה
  const [subPanel, setSubPanel] = useState(null); // null | 'merge'
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    canManageContact(contact.id).then(setCanManage);
  }, [contact.id]);

  function handleToggleFrozen() {
    if (!contact.frozen && !confirm(`להקפיא את ${contact.first} ${contact.last}? זה יחסום כל שינוי (עריכה, שלב, משימות) עד הפשרה מחדש.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await setContactFrozen(contact.id, !contact.frozen);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`למחוק את ${contact.first} ${contact.last}? הפעולה בלתי הפיכה.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteContact(contact.id);
      if (res?.error) setError(res.error);
      else router.push('/dashboard/contacts');
    });
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 14 }}
        title="הגדרות"
      >
        ⚙
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 38, insetInlineEnd: 0, background: '#fff', border: '1px solid #e5e5e5',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 260, zIndex: 50, padding: 10,
          }}
        >
          {error && <div style={{ color: '#b23b2f', fontSize: 12, marginBottom: 8 }}>שגיאה: {error}</div>}

          {canManage === null && <div style={{ fontSize: 12, color: '#9b9b9b', padding: '6px 4px' }}>בודק הרשאות...</div>}

          {canManage && !subPanel && (
            <>
              <button onClick={handleToggleFrozen} disabled={isPending} style={menuItemStyle()}>
                {contact.frozen ? '☀ הפשרת איש קשר' : '❄ הקפאת איש קשר'}
              </button>
              <button onClick={() => setSubPanel('merge')} disabled={isPending || contact.frozen} style={menuItemStyle(contact.frozen)}>
                ⛙ מיזוג עם כפול
              </button>
              <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0' }} />
              <NotConnectedButton
                label="היסטוריית שינויים"
                icon="🕐"
                message="היסטוריית שינויים — עדיין לא מחובר"
                style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'none', color: '#6b6b6b', fontWeight: 400 }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0' }} />
              <button onClick={handleDelete} disabled={isPending} style={{ ...menuItemStyle(), color: '#b23b2f', fontSize: 11.5 }}>
                🗑 מחיקת איש קשר
              </button>
            </>
          )}

          {canManage === false && (
            <div style={{ fontSize: 12, color: '#9b9b9b', padding: '6px 4px' }}>
              רק מנהל של אחת המחלקות של איש הקשר יכול לנהל אותו כאן.
            </div>
          )}

          {subPanel === 'merge' && (
            <MergePanel contact={contact} onBack={() => setSubPanel(null)} onDone={() => { setSubPanel(null); setOpen(false); router.refresh(); }} />
          )}
        </div>
      )}
    </div>
  );
}

function MergePanel({ contact, onBack, onDone }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function handleSearch(value) {
    setQuery(value);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, contact.id);
      setResults(res);
    });
  }

  function handleMerge(otherId, otherName) {
    if (!confirm(`לאחד את "${otherName}" לתוך "${contact.first} ${contact.last}"? הפגישות/משימות של "${otherName}" יעברו לכאן, ו"${otherName}" יימחק.`)) return;
    startTransition(async () => {
      const res = await mergeContacts(contact.id, otherId);
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b6b6b', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
        → חזרה
      </button>
      <p style={{ fontSize: 11.5, color: '#6b6b6b', margin: '0 0 8px' }}>
        חפש איש קשר כפול לפי שם, טלפון או מייל.
      </p>
      <input value={query} onChange={(e) => handleSearch(e.target.value)} placeholder="חיפוש..." style={inputStyle} />
      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {results.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}>
            <span>{r.first} {r.last} <span style={{ color: '#9b9b9b' }}>{r.phone || r.email || ''}</span></span>
            <button
              onClick={() => handleMerge(r.id, `${r.first} ${r.last}`)}
              disabled={isPending}
              style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
            >
              איחוד
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function menuItemStyle(disabled) {
  return {
    display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none',
    padding: '8px 6px', fontSize: 13, cursor: disabled ? 'default' : 'pointer', borderRadius: 6,
    opacity: disabled ? 0.5 : 1, color: '#0a0a0a',
  };
}
