'use client';

import { useMemo, useState, useTransition } from 'react';
import { shareContactWithColleague } from '../actions';

// כפתור "שתף עם נציג" בכותרת הכרטיס - פותח פופאובר קטן לבחירת עמית
// (מתוך כל המחלקות שאיש הקשר משויך אליהן) וכתיבת הודעת טקסט חופשי
// עליו. ההודעה נשמרת ב-contact_shares (מיגרציה 0033) ומופיעה אצל
// המקבל כ"הודעה חדשה" בתיבת ההודעות שלו (/dashboard/inbox).
export default function ShareContactButton({ contactId, departments = [], agentsByWorkspace = {} }) {
  const [open, setOpen] = useState(false);
  const [toUserId, setToUserId] = useState('');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const colleagues = useMemo(() => {
    const map = new Map();
    for (const d of departments) {
      for (const a of agentsByWorkspace?.[d.workspaceId] || []) {
        map.set(a.id, a.name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [departments, agentsByWorkspace]);

  function reset() {
    setToUserId('');
    setMessage('');
    setError(null);
    setSent(false);
  }

  function handleToggle() {
    setOpen((v) => !v);
    if (open) reset();
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const res = await shareContactWithColleague(contactId, toUserId, message);
      if (res?.error) { setError(res.error); return; }
      setSent(true);
      setTimeout(() => { setOpen(false); reset(); }, 1200);
    });
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={handleToggle}
        title="שיתוף איש הקשר עם נציג אחר"
        style={{
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, cursor: 'pointer', fontSize: 14, flexShrink: 0,
        }}
      >
        🔗
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 38, insetInlineEnd: 0, background: '#fff', border: '1px solid #e5e5e5',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 280, zIndex: 50, padding: 12,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>שיתוף איש הקשר עם נציג</div>

          {sent ? (
            <div style={{ fontSize: 12.5, color: '#1f7a3d' }}>✓ ההודעה נשלחה</div>
          ) : (
            <>
              {colleagues.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9b9b9b' }}>אין עמיתים נוספים במחלקות של איש הקשר הזה</div>
              ) : (
                <>
                  <select
                    value={toUserId}
                    onChange={(e) => setToUserId(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5, marginBottom: 8 }}
                  >
                    <option value="">בחר נציג...</option>
                    {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="הודעה חופשית על איש הקשר..."
                    rows={3}
                    style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  {error && <div style={{ color: '#b23b2f', fontSize: 11.5, marginTop: 6 }}>{error}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isPending || !toUserId || !message.trim()}
                      style={{ flex: 1, background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 12, cursor: 'pointer', opacity: (!toUserId || !message.trim()) ? 0.5 : 1 }}
                    >
                      {isPending ? 'שולח...' : 'שליחה'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOpen(false); reset(); }}
                      style={{ flex: 1, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 0', fontSize: 12, cursor: 'pointer' }}
                    >
                      ביטול
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
