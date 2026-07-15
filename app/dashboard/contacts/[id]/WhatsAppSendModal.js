'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendContactWhatsApp } from '../actions';

// שליחת הודעת WhatsApp ראשונה (תבנית מאושרת בלבד - חוק WhatsApp) לאיש
// קשר. אין כאן טקסט חופשי כי התוכן קבוע מראש בתבנית שאושרה מול Meta.
export default function WhatsAppSendModal({ contactId, workspaceId, phone, reason, onClose }) {
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const res = await sendContactWhatsApp(contactId, workspaceId, reason);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
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
        style={{ background: '#fff', borderRadius: 10, padding: 20, width: 400, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>שליחת הודעת WhatsApp</div>
        <div style={{ fontSize: 12, color: '#9b9b9b' }}>אל {phone}</div>

        {error && <div style={{ color: '#b23b2f', fontSize: 12.5 }}>שגיאה: {error}</div>}

        <div style={{ fontSize: 13, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12 }}>
          שלום {'{שם פרטי}'}, פנית אלינו במרכז דעת בנוגע ל{reason || 'פנייתך'}. נשמח לחזור אליך בהקדם. בברכה, צוות מרכז דעת.
        </div>
        <div style={{ fontSize: 11.5, color: '#9b9b9b' }}>
          זו הודעת תבנית קבועה (חובה לפי WhatsApp להודעה ראשונה) — אין אפשרות לערוך את התוכן.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onClose} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
            ביטול
          </button>
          <button
            onClick={handleSend}
            disabled={isPending}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? 'שולח...' : 'שליחה'}
          </button>
        </div>
      </div>
    </div>
  );
}
