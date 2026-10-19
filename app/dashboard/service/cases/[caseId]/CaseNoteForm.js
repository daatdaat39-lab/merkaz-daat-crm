'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addCaseNote } from '../actions';

// הערות/סיכום-שיחה לקריאת-שירות - אותו עיקרון כמו QuickActivityLogForm.js
// (הכרטיס-האישי/מסך-הליד), אבל כותב ל-service_case_notes (migration 0160)
// במקום lead_inquiries - קריאת-שירות אינה שיוך-מחלקה, ועוברת בין כמה
// נציגים בפועל (העברה/שינוי-נציג), אז אין כאן שינוי-שלב משולב כמו בליד.
export default function CaseNoteForm({ caseId }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await addCaseNote(caseId, note);
      if (res?.error) { setError(res.error); return; }
      setNote('');
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 100, padding: '7px 16px',
        fontSize: 13, cursor: 'pointer', marginBottom: 16, color: 'var(--k-text)',
      }}>
        📝 הערות / סיכום שיחה
      </button>
    );
  }

  return (
    <div style={{ background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>הערות / סיכום שיחה</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="מה עלה בשיחה? מה הוחלט? מה הצעד הבא?"
        rows={3}
        autoFocus
        style={{ width: '100%', border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10, background: 'var(--k-surface)', color: 'var(--k-text)' }}
      />
      {error && <div style={{ color: 'var(--k-danger-text)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !note.trim()} style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'שמירה בציר-הזמן'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setNote(''); setError(null); }} style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 100, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer', color: 'var(--k-text)' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}
