'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendContactEmail } from '../actions';

// חלון קטן לכתיבת מייל ושליחתו מתוך המחלקה הפעילה, דרך תיבת המייל
// המחוברת לאותה מחלקה (email_connections). נרשם גם ב-sent_emails
// כך שיוצג בטאב "פעילות" בכרטיס.
export default function EmailComposeModal({ contactId, workspaceId, fromAddress, toAddress, onClose, onSent }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const res = await sendContactEmail(contactId, workspaceId, subject, body);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onSent?.();
      onClose();
    });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, padding: 20, width: 440, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>שליחת מייל</div>
        <div style={{ fontSize: 12, color: '#9b9b9b' }}>מאת {fromAddress} · אל {toAddress}</div>

        {error && <div style={{ color: '#b23b2f', fontSize: 12.5 }}>שגיאה: {error}</div>}

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="נושא"
          style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="תוכן ההודעה..."
          rows={8}
          style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onClose} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
            ביטול
          </button>
          <button
            onClick={handleSend}
            disabled={isPending || !subject.trim() || !body.trim()}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? 'שולח...' : 'שליחה'}
          </button>
        </div>
      </div>
    </div>
  );
}
