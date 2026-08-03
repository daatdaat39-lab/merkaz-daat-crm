'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logQuickActivity } from '../actions';

// "סיכום שיחה מהיר" - תיעוד שיחה/וואטסאפ/פגישה ישירות מהכרטיס: כותבים
// סיכום קצר, בוחרים (אופציונלי) שלב חדש, ושמירה אחת גם רושמת פנייה
// חדשה בהיסטוריה וגם מאפסת את שעון "טיפול אחרון".
export default function QuickActivityLogForm({ contactId, department, stages, labels = {}, frozen }) {
  const [open, setOpen] = useState(false);
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
      router.refresh();
    });
  }

  if (frozen) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 14px',
        fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 16,
      }}>
        📝 סיכום שיחה מהיר
      </button>
    );
  }

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', marginBottom: 8, textTransform: 'uppercase' }}>📝 סיכום שיחה מהיר</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="מה סוכם בשיחה/וואטסאפ/פגישה..."
        rows={3}
        autoFocus
        style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#6b6b6b' }}>שינוי שלב (אופציונלי):</span>
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}>
          {stages.map((s) => <option key={s} value={s}>{labels[s] || s}</option>)}
        </select>
      </div>
      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !note.trim()} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'שמירה'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setNote(''); setError(null); }} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}
