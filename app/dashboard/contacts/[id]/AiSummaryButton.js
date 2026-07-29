'use client';

import { useState, useTransition } from 'react';
import { getAiContactSummary } from '../actions';

// כפתור "סיכום AI" - קורא ל-Claude Haiku לסכם את מצב איש הקשר לפי הערות
// והיסטוריית פעילות אמיתית, במקום להמתין לחיבור הקלטות שיחה שעדיין לא קיים
export default function AiSummaryButton({ contactId }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setOpen(true);
    if (summary || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await getAiContactSummary(contactId);
      if (res?.error) setError(res.error);
      else setSummary(res.summary || 'אין מספיק מידע כדי לייצר סיכום.');
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
          border: '1px solid var(--border, #e5e5e5)', background: '#fff', fontSize: 12.5, cursor: 'pointer',
        }}
      >
        <span>✨</span> סיכום AI
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 6, width: 320, maxWidth: '80vw',
          background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 14, fontSize: 13,
          boxShadow: '0 10px 30px rgba(0,0,0,0.14)', zIndex: 80, lineHeight: 1.6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>סיכום AI</span>
            <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9b9b9b' }}>✕</button>
          </div>
          {isPending && <div style={{ color: '#9b9b9b' }}>מסכם...</div>}
          {error && <div style={{ color: '#b23b2f' }}>שגיאה: {error}</div>}
          {summary && !isPending && <div style={{ color: '#333' }}>{summary}</div>}
        </div>
      )}
    </div>
  );
}
