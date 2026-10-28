'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logNewInquiry } from '../actions';
import { getInquiryReasons } from '../../components/pipelines';

// "פנייה חדשה" לאיש קשר שכבר קיים במחלקה - אותה רשימת "מהות פנייה"
// בדיוק כמו ביצירת ליד חדש (AddContactForm), רק שהשיוך למחלקה כבר קיים.
// ליד "📝 סיכום שיחה מהיר" בכוונה (אותו סגנון כפתור מכווץ), כדי שיהיה
// ברור שאלו שתי דרכים שונות לתעד פעילות: טקסט חופשי מול מהות מסודרת.
export default function NewInquiryForm({ contactId, workspaceId, workspaceName, frozen, forceOpen = false, onDone }) {
  const reasonOptions = getInquiryReasons(workspaceName);
  const [open, setOpen] = useState(forceOpen);
  const [reason, setReason] = useState(reasonOptions[0] || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await logNewInquiry(contactId, workspaceId, reason, reason === 'אחר' ? note : null);
      if (res?.error) { setError(res.error); return; }
      setNote('');
      setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  function handleCancel() {
    setOpen(false);
    setNote('');
    setError(null);
    onDone?.();
  }

  if (frozen) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 16px',
        fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 16, color: 'var(--k-text, inherit)',
      }}>
        📩 פנייה חדשה
      </button>
    );
  }

  return (
    <div style={{ background: 'var(--k-pill-bg, #f9f9f9)', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted, #9b9b9b)', marginBottom: 8, textTransform: 'uppercase' }}>📩 פנייה חדשה</div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--k-text-muted, #6b6b6b)', display: 'block', marginBottom: 4 }}>מהות הפנייה</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box', background: 'var(--k-surface, var(--bg))', color: 'var(--k-text, inherit)' }}>
          {reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {reason === 'אחר' && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--k-text-muted, #6b6b6b)', display: 'block', marginBottom: 4 }}>פירוט מהות הפנייה</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="למשל: שאלה על חידוש הוראת קבע"
            autoFocus
            style={{ width: '100%', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box', background: 'var(--k-surface, var(--bg))', color: 'var(--k-text, inherit)' }}
          />
        </div>
      )}
      {error && <div style={{ color: 'var(--k-danger-text, #b23b2f)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !reason} style={{ background: 'var(--k-accent, #0a0a0a)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'רישום פנייה'}
        </button>
        <button type="button" onClick={handleCancel} style={{ background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer', color: 'var(--k-text, inherit)' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}
