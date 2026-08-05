'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const STATUS_LABELS = { pending: 'ממתין', approved: 'אושר', needs_info: 'צריך פרטים נוספים' };
const STATUS_COLORS = {
  pending: { bg: '#fffbeb', color: '#d97706' },
  approved: { bg: '#f0fdf4', color: '#16a34a' },
  needs_info: { bg: '#fef2f2', color: '#dc2626' },
};

function subjectLabel(r) {
  if (r.tasks) return `משימה: ${r.tasks.title}`;
  if (r.meetings) {
    const c = r.meetings.contacts;
    return `פגישה: ${c ? `${c.first} ${c.last}` : ''} · ${new Date(r.meetings.meeting_date).toLocaleDateString('he-IL')} ${r.meetings.meeting_time?.slice(0, 5) || ''}`;
  }
  return 'ללא נושא מקושר';
}

// שורת בקשת אישור אחת - בתפקיד "נמען" מציגה אישור/צריך-פרטים-נוספים,
// ובתפקיד "שולח" מציגה את הסטטוס ואפשרות לשלוח מחדש אחרי עדכון
export default function ApprovalRow({ r, nameById, mode, respondAction, resendAction }) {
  const [responding, setResponding] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [resendNote, setResendNote] = useState(r.note || '');
  const [resending, setResending] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  const colors = STATUS_COLORS[r.status] || STATUS_COLORS.pending;

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await respondAction(r.id, { approve: true });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleNeedsInfo() {
    setError(null);
    startTransition(async () => {
      const res = await respondAction(r.id, { approve: false, responseNote });
      if (res?.error) setError(res.error);
      else { setResponding(false); setResponseNote(''); router.refresh(); }
    });
  }

  function handleResend() {
    setError(null);
    startTransition(async () => {
      const res = await resendAction(r.id, resendNote);
      if (res?.error) setError(res.error);
      else { setResending(false); router.refresh(); }
    });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{subjectLabel(r)}</div>
          <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 2 }}>
            {mode === 'incoming' ? `מאת: ${nameById[r.requested_by] || 'משתמש'}` : `אל: ${nameById[r.requested_to] || 'משתמש'}`}
            {' · '}{new Date(r.created_at).toLocaleDateString('he-IL')}
          </div>
          {r.note && <div style={{ fontSize: 12.5, marginTop: 6 }}>{r.note}</div>}
          {r.status === 'needs_info' && r.response_note && (
            <div style={{ fontSize: 12, marginTop: 6, color: '#dc2626' }}>💬 {r.response_note}</div>
          )}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: colors.bg, color: colors.color, whiteSpace: 'nowrap' }}>
          {STATUS_LABELS[r.status] || r.status}
        </span>
      </div>

      {error && <div style={{ color: 'var(--danger, #a3392f)', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}

      {mode === 'incoming' && r.status === 'pending' && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
          {responding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder="מה צריך לעדכן?"
                style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleNeedsInfo} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>שליחה</button>
                <button onClick={() => setResponding(false)} style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>ביטול</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleApprove} disabled={isPending} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>✓ אישור</button>
              <button onClick={() => setResponding(true)} style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>צריך פרטים נוספים</button>
            </div>
          )}
        </div>
      )}

      {mode === 'outgoing' && r.status === 'needs_info' && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
          {resending ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={resendNote}
                onChange={(e) => setResendNote(e.target.value)}
                placeholder="עדכון לבקשה..."
                style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleResend} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>שליחה מחדש</button>
                <button onClick={() => setResending(false)} style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>ביטול</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setResending(true)} style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
              עדכון ושליחה מחדש
            </button>
          )}
        </div>
      )}
    </div>
  );
}
