'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logQuickActivity } from '../actions';

// "סיכום שיחה מהיר" - תיעוד שיחה/וואטסאפ/פגישה ישירות מהכרטיס: כותבים
// סיכום קצר, בוחרים (אופציונלי) שלב חדש, ושמירה אחת גם רושמת פנייה
// חדשה בהיסטוריה וגם מאפסת את שעון "טיפול אחרון".
export default function QuickActivityLogForm({ contactId, department, stages, labels = {}, frozen, forceOpen = false, onDone }) {
  const [open, setOpen] = useState(forceOpen);
  const [note, setNote] = useState('');
  const [stage, setStage] = useState(department.stage);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await logQuickActivity(contactId, department.id, note, stage !== department.stage ? stage : null);
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
        background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 100, padding: '7px 16px',
        fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 16, color: 'var(--k-text, inherit)',
      }}>
        📝 סיכום שיחה מהיר
      </button>
    );
  }

  return (
    <div style={{ background: 'var(--k-pill-bg, #f9f9f9)', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted, #9b9b9b)', marginBottom: 8, textTransform: 'uppercase' }}>📝 סיכום שיחה מהיר</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="מה סוכם בשיחה/וואטסאפ/פגישה..."
        rows={3}
        autoFocus
        style={{ width: '100%', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 8, background: 'var(--k-surface, var(--bg))', color: 'var(--k-text, inherit)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--k-text-muted, #6b6b6b)' }}>שינוי שלב (אופציונלי):</span>
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 100, padding: '5px 10px', fontSize: 12.5, background: 'var(--k-surface, var(--bg))', color: 'var(--k-text, inherit)' }}>
          {stages.map((s) => <option key={s} value={s}>{labels[s] || s}</option>)}
        </select>
      </div>
      {error && <div style={{ color: 'var(--k-danger-text, #b23b2f)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !note.trim()} style={{ background: 'var(--k-accent, #0a0a0a)', color: '#fff', border: 'none', borderRadius: 100, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'שמירה בציר-הזמן'}
        </button>
        <button type="button" onClick={handleCancel} style={{ background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 100, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer', color: 'var(--k-text, inherit)' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}
