'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { sendContactWhatsAppChatMessage } from '../contacts/actions';
import AddContactForm from '../contacts/AddContactForm';
import { initials } from '../components/ui';

// מחליף את ה-server-component-הטהור-הישן: שתי יכולות-אינטראקטיביות -
// יצירת-איש-קשר-מיידית משורה-לא-מזוהה (contact_id ריק, עם phone
// ממולא-מראש ב-AddContactForm הקיים) ותגובה-מהירה בלי-לצאת-מהמסך.
export default function WhatsappPendingClient({ pending, workspaces, defaultWorkspaceId }) {
  const [replyOpenId, setReplyOpenId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [sentIds, setSentIds] = useState(new Set());
  const [replyError, setReplyError] = useState('');

  function handleSend(row) {
    if (!replyText.trim()) return;
    setReplyError('');
    startTransition(async () => {
      const res = await sendContactWhatsAppChatMessage(row.contact_id, row.workspace_id || null, replyText.trim());
      if (res?.error) { setReplyError(res.error); return; }
      setSentIds((prev) => new Set(prev).add(row.id));
      setReplyOpenId(null);
      setReplyText('');
    });
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 6px', fontSize: 20 }}>WhatsApp — ממתינים לתגובה</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 12.5 }}>
        {pending.length} שיחות שההודעה האחרונה בהן הגיעה מהלקוח ועדיין לא נענתה
      </p>

      {pending.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          🎉 אין שיחות ממתינות כרגע
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pending.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
            }}
          >
            <Link
              href={r.contact_id ? `/dashboard/contacts/${r.contact_id}` : '#'}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
            >
              <span style={{
                width: 34, height: 34, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, flexShrink: 0,
              }}>
                {r.contacts ? initials(r.contacts.first, r.contacts.last) : '?'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {r.contacts ? `${r.contacts.first} ${r.contacts.last}` : r.phone}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.message || `הודעת תבנית${r.reason ? ` — ${r.reason}` : ''}`}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {new Date(r.sent_at).toLocaleDateString('he-IL')} {new Date(r.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </Link>

            <div style={{ flexShrink: 0 }}>
              {r.contact_id ? (
                sentIds.has(r.id) ? (
                  <span style={{ fontSize: 11.5, color: 'var(--k-ok-text, #1f7a4d)' }}>✓ נשלח</span>
                ) : replyOpenId === r.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSend(r); if (e.key === 'Escape') setReplyOpenId(null); }}
                      placeholder="כתיבת תגובה..." style={{ fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', width: 180 }}
                    />
                    <button type="button" onClick={() => handleSend(r)} disabled={isPending || !replyText.trim()} style={{ fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'var(--text)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', opacity: isPending || !replyText.trim() ? 0.5 : 1 }}>
                      שליחה
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setReplyOpenId(r.id); setReplyText(''); setReplyError(''); }} style={{ fontSize: 11.5, color: 'var(--text)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>
                    ↩ השב
                  </button>
                )
              ) : (
                <AddContactForm
                  label="+ יצירת איש קשר" modalTitle="יצירת איש קשר מהודעת WhatsApp"
                  workspaces={workspaces} defaultWorkspaceId={defaultWorkspaceId}
                  defaultPhone={r.phone} linkWhatsappPhone={r.phone}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {replyError && <div style={{ fontSize: 11.5, color: 'var(--red, #b23b2f)', marginTop: 10 }}>שגיאה: {replyError}</div>}
    </div>
  );
}
