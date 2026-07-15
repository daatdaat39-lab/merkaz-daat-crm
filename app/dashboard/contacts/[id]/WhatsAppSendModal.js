'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendContactWhatsApp, sendContactWhatsAppChatMessage } from '../actions';

// שליחת WhatsApp לאיש קשר. הודעה ראשונה חייבת להיות תבנית מאושרת
// (חוק WhatsApp) - אחריה נפתח חלון של 24 שעות לשליחת הודעות חופשיות,
// כל עוד הלקוח כבר ענה להודעת התבנית.
export default function WhatsAppSendModal({ contactId, workspaceId, phone, reason, hasPriorMessage, onClose }) {
  const [mode, setMode] = useState(hasPriorMessage ? 'chat' : 'template');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSendTemplate() {
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

  function handleSendChat() {
    setError(null);
    startTransition(async () => {
      const res = await sendContactWhatsAppChatMessage(contactId, workspaceId, message);
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
        style={{ background: '#fff', borderRadius: 10, padding: 20, width: 420, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>שליחת הודעת WhatsApp</div>
        <div style={{ fontSize: 12, color: '#9b9b9b' }}>אל {phone}</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <button
            onClick={() => setMode('chat')}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12.5, borderRadius: 6, cursor: 'pointer',
              border: '1px solid ' + (mode === 'chat' ? '#0a0a0a' : '#e5e5e5'),
              background: mode === 'chat' ? '#0a0a0a' : '#fff', color: mode === 'chat' ? '#fff' : '#333',
            }}
          >
            הודעה חופשית
          </button>
          <button
            onClick={() => setMode('template')}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12.5, borderRadius: 6, cursor: 'pointer',
              border: '1px solid ' + (mode === 'template' ? '#0a0a0a' : '#e5e5e5'),
              background: mode === 'template' ? '#0a0a0a' : '#fff', color: mode === 'template' ? '#fff' : '#333',
            }}
          >
            שליחת תבנית רשמית
          </button>
        </div>

        {error && <div style={{ color: '#b23b2f', fontSize: 12.5 }}>שגיאה: {error}</div>}

        {mode === 'template' ? (
          <>
            <div style={{ fontSize: 13, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12 }}>
              שלום {'{שם פרטי}'}, פנית אלינו במרכז דעת בנוגע ל{reason || 'פנייתך'}. נשמח לחזור אליך בהקדם. בברכה, צוות מרכז דעת.
            </div>
            <div style={{ fontSize: 11.5, color: '#9b9b9b' }}>
              זו הודעת תבנית קבועה (חובה לפי WhatsApp להודעה ראשונה, או כשחלון 24 השעות נסגר) — אין אפשרות לערוך את התוכן.
            </div>
          </>
        ) : (
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="תוכן ההודעה..."
              rows={5}
              style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ fontSize: 11.5, color: '#9b9b9b' }}>
              אפשרי רק אם הלקוח כבר ענה להודעת התבנית בתוך 24 השעות האחרונות. אם השליחה תיכשל, נסה את התבנית הרשמית.
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onClose} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
            ביטול
          </button>
          <button
            onClick={mode === 'template' ? handleSendTemplate : handleSendChat}
            disabled={isPending || (mode === 'chat' && !message.trim())}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? 'שולח...' : 'שליחה'}
          </button>
        </div>
      </div>
    </div>
  );
}
