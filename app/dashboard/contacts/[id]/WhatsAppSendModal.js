'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendContactWhatsApp, sendContactWhatsAppChatMessage } from '../actions';

// חלון צ'אט WhatsApp מלא לאיש קשר: מציג את כל ההיסטוריה (הודעות
// שנשלחו והודעות שהתקבלו מהלקוח, לפי כיוון) כבועות שיחה, עם תיבת
// כתיבה בתחתית. הודעה ראשונה/כשאין עדיין שיחה פתוחה חייבת להיות
// תבנית מאושרת (חוק WhatsApp) - לכן יש גם כפתור לשליחת התבנית הרשמית.
export default function WhatsAppSendModal({ contactId, workspaceId, phone, reason, thread = [], templates = [], onClose }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const router = useRouter();

  const sorted = [...thread].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
  const selectedTemplate = templates.find((t) => t.id === templateId) || templates[0];

  function handleSendTemplate() {
    if (templates.length > 1 && !pickingTemplate) { setPickingTemplate(true); return; }
    setError(null);
    startTransition(async () => {
      const res = await sendContactWhatsApp(contactId, workspaceId, reason, selectedTemplate?.template_id);
      if (res?.error) { setError(res.error); return; }
      setPickingTemplate(false);
      router.refresh();
    });
  }

  function handleSendChat() {
    if (!message.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await sendContactWhatsAppChatMessage(contactId, workspaceId, message);
      if (res?.error) { setError(res.error); return; }
      setMessage('');
      router.refresh();
    });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, width: 440, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>WhatsApp</div>
            <div style={{ fontSize: 12, color: '#9b9b9b' }}>{phone}</div>
          </div>
          <button
            onClick={handleSendTemplate}
            disabled={isPending || templates.length === 0}
            title={templates.length === 0 ? 'אין עדיין תבנית מאושרת מוגדרת' : 'שולח הודעת תבנית רשמית (למקרה של פתיחת שיחה חדשה, או שחלון 24 השעות נסגר)'}
            style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, cursor: templates.length === 0 ? 'default' : 'pointer', color: '#333', opacity: templates.length === 0 ? 0.5 : 1 }}
          >
            📨 שליחת תבנית רשמית
          </button>
        </div>

        {pickingTemplate && templates.length > 1 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', gap: 8, alignItems: 'center', background: '#f9f9f9' }}>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={handleSendTemplate} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              שליחה
            </button>
            <button onClick={() => setPickingTemplate(false)} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f5f3ee', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 12.5, color: '#9b9b9b', textAlign: 'center', marginTop: 20 }}>
              אין עדיין היסטוריית הודעות. שלח את התבנית הרשמית כדי לפתוח שיחה.
            </div>
          )}
          {sorted.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'in' ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '78%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                background: m.direction === 'in' ? '#fff' : '#dcf3d4',
                border: m.direction === 'in' ? '1px solid #e5e5e5' : 'none',
              }}>
                <div>{m.kind === 'template' ? `📨 ${m.message || `הודעת תבנית${m.reason ? ` — ${m.reason}` : ''}`}` : m.message}</div>
                <div style={{ fontSize: 10, color: '#9b9b9b', marginTop: 4, textAlign: 'left' }}>
                  {new Date(m.sent_at).toLocaleDateString('he-IL')} {new Date(m.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <div style={{ padding: '6px 18px', color: '#b23b2f', fontSize: 12.5 }}>שגיאה: {error}</div>}

        <div style={{ padding: 12, borderTop: '1px solid #e5e5e5', display: 'flex', gap: 8 }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
            placeholder="הודעה חופשית... (רק אם הלקוח כבר ענה בתוך 24 שעות)"
            style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
          />
          <button
            onClick={handleSendChat}
            disabled={isPending || !message.trim()}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}
          >
            שליחה
          </button>
        </div>
      </div>
    </div>
  );
}
