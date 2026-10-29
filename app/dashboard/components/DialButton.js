'use client';

import { useState, useTransition } from 'react';
import { dialContact } from '../contacts/actions';
import { PhoneIcon } from './icons';

// חיוג-יזום (click-to-dial) - מחליף/משלים את NotConnectedButton בכל
// מקום שבו יש כבר איש-קשר עם מספר-טלפון. אין כאן מעקב-חי-אחרי-מצב-
// השיחה (לא בסקופ) - רק אישור ש"השיחה נשלחה", שאר-המעקב (מענה/משך/
// הקלטה) מגיע כרגיל דרך ה-webhook של 015 לטאב "פעילות".
export default function DialButton({ contactId, style = {} }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(null); // null | 'sent' | string (error)

  function handleClick() {
    setStatus(null);
    startTransition(async () => {
      const res = await dialContact(contactId);
      if (res.error) { setStatus(res.error); return; }
      setStatus('sent');
      setTimeout(() => setStatus(null), 5000);
    });
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8,
          fontSize: 13, cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1,
          background: 'var(--k-surface)', color: 'var(--k-text)', border: '1px solid var(--k-border)',
          ...style,
        }}
      >
        <PhoneIcon size={14} />
        <span>{isPending ? 'מחייג...' : 'חייג'}</span>
      </button>
      {status === 'sent' && (
        <div style={{ position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 6, fontSize: 11.5, color: 'var(--k-ok-text)', background: 'var(--k-ok-bg)', padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 5 }}>
          השיחה נשלחה — הטלפון שלך יצלצל תוך כמה שניות
        </div>
      )}
      {status && status !== 'sent' && (
        <div style={{ position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 6, fontSize: 11.5, color: 'var(--k-danger-text)', background: 'var(--k-danger-bg)', padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 5 }}>
          {status}
        </div>
      )}
    </span>
  );
}
