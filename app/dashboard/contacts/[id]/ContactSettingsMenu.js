'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { canManageContact, setContactFrozen, deleteContact, mergeContacts, searchContacts, removeDepartmentMembership, getContactAuditLog } from '../actions';
import MergeFieldsPicker from '../MergeFieldsPicker';

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 };

// תפריט ⚙ עם פעולות ניהול על איש הקשר - הקפאה/הפשרה, מיזוג עם כפול,
// ומחיקה (מוקטנת ומוסתרת כאן בכוונה, לא כפתור בולט). כל הפעולות האלה
// דורשות owner/admin של אחת המחלקות של איש הקשר - נבדק דרך canManageContact.
export default function ContactSettingsMenu({ contact, activeDepartment }) {
  const [open, setOpen] = useState(false);
  const [canManage, setCanManage] = useState(null); // null = בבדיקה
  const [subPanel, setSubPanel] = useState(null); // null | 'merge' | 'history'
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

  function handleRemoveDepartment() {
    if (!activeDepartment) return;
    if (!confirm(`להסיר את השיוך למחלקת "${activeDepartment.workspaceName}"? הכרטיס עצמו לא נמחק, רק השיוך למחלקה הזו.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeDepartmentMembership(contact.id, activeDepartment.workspaceId);
      if (res?.error) setError(res.error);
      else { setOpen(false); router.refresh(); }
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
              {activeDepartment && (
                <button onClick={handleRemoveDepartment} disabled={isPending || contact.frozen} style={{ ...menuItemStyle(contact.frozen), color: '#b23b2f' }}>
                  🗑 הסרה ממחלקת "{activeDepartment.workspaceName}"
                </button>
              )}
              <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0' }} />
              <button onClick={() => setSubPanel('history')} disabled={isPending} style={menuItemStyle()}>
                🕐 היסטוריית שינויים
              </button>
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

          {subPanel === 'history' && (
            <HistoryPanel contactId={contact.id} onBack={() => setSubPanel(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function MergePanel({ contact, onBack, onDone }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [picking, setPicking] = useState(null); // the duplicate contact chosen, awaiting field resolution
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function handleSearch(value) {
    setQuery(value);
    setDropdownOpen(true);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, contact.id);
      setResults(res);
    });
  }

  function handleMerge(resolvedFields) {
    startTransition(async () => {
      const res = await mergeContacts(contact.id, picking.id, resolvedFields);
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  if (picking) {
    return (
      <div
        onClick={() => setPicking(null)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: 22, width: 480, maxWidth: '92vw' }}>
          <MergeFieldsPicker
            existing={contact}
            newValues={picking}
            onConfirm={handleMerge}
            onCancel={() => setPicking(null)}
          />
          {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 10 }}>שגיאה: {error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b6b6b', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
        → חזרה
      </button>
      <p style={{ fontSize: 11.5, color: '#6b6b6b', margin: '0 0 8px' }}>
        חפש איש קשר כפול לפי שם, טלפון או מייל.
      </p>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          placeholder="חיפוש..."
          style={inputStyle}
        />
        {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}
        {dropdownOpen && query.trim().length >= 2 && (
          <div style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, marginTop: 4,
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto', zIndex: 60,
          }}>
            {results.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#9b9b9b' }}>אין תוצאות</div>
            )}
            {results.map((r) => (
              <div
                key={r.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0', padding: '8px 10px', fontSize: 12 }}
              >
                <span>{r.first} {r.last} <span style={{ color: '#9b9b9b' }}>{r.phone || r.email || ''}</span></span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPicking(r)}
                  disabled={isPending}
                  style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                >
                  איחוד
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// יומן השינויים - מי הקפיא/הפשיר/מיזג/הסיר ממחלקה/מחק, ומתי. נטען
// בעצלנות (רק כשנפתח), כי זו לא הפעולה הנפוצה בתפריט הזה.
function HistoryPanel({ contactId, onBack }) {
  const [entries, setEntries] = useState(null); // null = בטעינה

  useEffect(() => {
    getContactAuditLog(contactId).then(setEntries);
  }, [contactId]);

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b6b6b', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
        → חזרה
      </button>
      {entries === null && <div style={{ fontSize: 12, color: '#9b9b9b', padding: '6px 4px' }}>טוען...</div>}
      {entries && entries.length === 0 && <div style={{ fontSize: 12, color: '#9b9b9b', padding: '6px 4px' }}>אין עדיין פעולות רשומות</div>}
      {entries && entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
          {entries.map((e) => (
            <div key={e.id} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 9px', fontSize: 11.5 }}>
              <div><b>{e.action}</b> · {e.performedByName}</div>
              {e.detail && <div style={{ color: '#9b9b9b', marginTop: 2 }}>{e.detail}</div>}
              <div style={{ color: '#c0c0c0', marginTop: 2 }}>
                {new Date(e.created_at).toLocaleDateString('he-IL')} {new Date(e.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
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
