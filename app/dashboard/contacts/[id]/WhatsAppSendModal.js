'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendContactWhatsApp, sendContactWhatsAppChatMessage, updateContactPhone } from '../actions';

// חלון צ'אט WhatsApp מלא לאיש קשר: מציג את כל ההיסטוריה (הודעות
// שנשלחו והודעות שהתקבלו מהלקוח, לפי כיוון) כבועות שיחה, עם תיבת
// כתיבה בתחתית. הודעה ראשונה/כשאין עדיין שיחה פתוחה חייבת להיות
// תבנית מאושרת (חוק WhatsApp) - לכן יש גם כפתור לשליחת התבנית הרשמית.
export default function WhatsAppSendModal({ contactId, workspaceId, phone, reason, thread = [], templates = [], onClose, initialMessage = '', skipRefresh = false }) {
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  // הודעות שנשלחו בפועל תוך-כדי-פתיחת-החלון - כשskipRefresh=true (מתוך
  // שיחה פעילה) אין router.refresh() שיביא את ההודעה בחזרה מה-DB, אז
  // בלעדי זה הטלפן/ית לא רואה שום אישור שהיא באמת נשלחה. תצוגה-אופטימית
  // מקומית, לא תלויה ברענון.
  const [locallySent, setLocallySent] = useState([]);
  // תיקון-מספר ידני ("עיפרון") - InforU מחזיר לפעמים 200-תקין גם כשהמסירה
  // בפועל נכשלת בגלל פורמט לא-תקין (בלי לבדוק את גוף-התשובה, ר' lib/
  // inforu/whatsapp.js) - אי אפשר לסמוך על הופעת-שגיאה כתנאי להצעת-תיקון,
  // אז האפשרות זמינה תמיד, לא רק אחרי כישלון שזוהה.
  const [currentPhone, setCurrentPhone] = useState(phone);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(phone);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const router = useRouter();

  function startEditPhone() {
    setPhoneDraft(currentPhone || '');
    setEditingPhone(true);
  }

  async function savePhone() {
    const next = phoneDraft.trim();
    if (!next || next === currentPhone) { setEditingPhone(false); return; }
    setPhoneSaving(true);
    const res = await updateContactPhone(contactId, 'phone', next);
    setPhoneSaving(false);
    if (res?.error) { setError(res.error); return; }
    setCurrentPhone(next);
    setEditingPhone(false);
  }

  const sorted = [...thread, ...locallySent].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
  const selectedTemplate = templates.find((t) => t.id === templateId) || templates[0];

  // try/catch מפורש כאן - לא סומכים על כך ש-Server Action תמיד מחזירה
  // {error} ולא זורקת חריגה (רשת/timeout/כשל-לא-צפוי ב-InforU). חריגה
  // לא-תפוסה בתוך startTransition מגיעה ל-Error Boundary הקרוב ומפילה
  // את כל עץ-הרכיבים מתחתיו - כולל ActiveCallPanel כשהמודאל הזה נפתח
  // מתוך שיחה פעילה, בדיוק התופעה שדווחה ("הכרטיס נסגר" אחרי שליחת
  // וואטסאפ).
  function handleSendTemplate() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendContactWhatsApp(contactId, workspaceId, reason, selectedTemplate?.template_id);
        if (res?.error) { setError(res.error); return; }
        if (skipRefresh) {
          setLocallySent((prev) => [...prev, {
            id: `local-${prev.length}-${selectedTemplate?.id || ''}`, kind: 'template',
            message: selectedTemplate?.preview_text || null, reason, direction: 'out', sent_at: new Date().toISOString(),
          }]);
        } else {
          router.refresh();
        }
      } catch (e) {
        setError(e?.message || 'שליחת ההודעה נכשלה');
      }
    });
  }

  function handleSendChat() {
    if (!message.trim()) return;
    setError(null);
    startTransition(async () => {
      const sentText = message.trim();
      try {
        const res = await sendContactWhatsAppChatMessage(contactId, workspaceId, sentText);
        if (res?.error) { setError(res.error); return; }
        setMessage('');
        if (skipRefresh) {
          setLocallySent((prev) => [...prev, {
            id: `local-${prev.length}-chat`, kind: 'chat', message: sentText, direction: 'out', sent_at: new Date().toISOString(),
          }]);
        } else {
          router.refresh();
        }
      } catch (e) {
        setError(e?.message || 'שליחת ההודעה נכשלה');
      }
    });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg)', borderRadius: 10, width: 440, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>WhatsApp</div>
            {editingPhone ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                <input
                  value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditingPhone(false); }}
                  autoFocus dir="ltr"
                  style={{ fontSize: 12, border: '1px solid #e5e5e5', borderRadius: 4, padding: '2px 6px', width: 110 }}
                />
                <button type="button" onClick={savePhone} disabled={phoneSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="שמירה">✓</button>
                <button type="button" onClick={() => setEditingPhone(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9b9b9b' }} title="ביטול">✕</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#9b9b9b', display: 'flex', alignItems: 'center', gap: 4 }}>
                {currentPhone}
                <button type="button" onClick={startEditPhone} title="תיקון מספר" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, opacity: 0.6 }}>✏️</button>
              </div>
            )}
          </div>
          {templates.length <= 1 && (
            <button
              onClick={handleSendTemplate}
              disabled={isPending || templates.length === 0}
              title={templates.length === 0 ? 'אין עדיין תבנית מאושרת מוגדרת' : 'שולח הודעת תבנית רשמית (למקרה של פתיחת שיחה חדשה, או שחלון 24 השעות נסגר)'}
              style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, cursor: templates.length === 0 ? 'default' : 'pointer', color: '#333', opacity: templates.length === 0 ? 0.5 : 1 }}
            >
              📨 שליחת תבנית רשמית
            </button>
          )}
        </div>

        {templates.length > 1 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', gap: 8, alignItems: 'center', background: '#f9f9f9' }}>
            <span style={{ fontSize: 11.5, color: '#9b9b9b', whiteSpace: 'nowrap' }}>📨 תבנית:</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={handleSendTemplate} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              שליחה
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
