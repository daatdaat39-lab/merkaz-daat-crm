'use client';

import { useState, useTransition } from 'react';
import { createApprovalRequest } from './actions';

// כפתור קטן לשליחת בקשת אישור לנציג אחר על משימה/פגישה ספציפית - לדוגמה
// "מתאים לך גם השעה הזו?" - לפני שסוגרים סופית. מוטמע בתוך TaskRow/MeetingRow.
export default function ApprovalRequestButton({ taskId, meetingId, members = [], currentUserId }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const otherMembers = members.filter((m) => m.id !== currentUserId);
  if (otherMembers.length === 0) return null;

  function handleSend() {
    if (!to) return;
    setError(null);
    startTransition(async () => {
      const res = await createApprovalRequest({ taskId, meetingId, requestedTo: to, note });
      if (res?.error) setError(res.error);
      else { setSent(true); setOpen(false); }
    });
  }

  if (sent) {
    return <span style={{ fontSize: 11.5, color: '#16a34a' }}>✓ נשלחה בקשת אישור</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, color: '#666', cursor: 'pointer' }}
      >
        🤝 בקשת אישור מנציג
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 6, padding: 8 }}>
      <select value={to} onChange={(e) => setTo(e.target.value)} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}>
        <option value="">בחר נציג...</option>
        {otherMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder='למשל: "מתאים לך גם השעה הזו?"'
        style={{ flex: 1, minWidth: 140, border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
      />
      <button type="button" onClick={handleSend} disabled={isPending || !to} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
        שליחה
      </button>
      <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#9b9b9b', fontSize: 12, cursor: 'pointer' }}>
        ביטול
      </button>
      {error && <div style={{ width: '100%', color: 'var(--danger, #a3392f)', fontSize: 11.5 }}>שגיאה: {error}</div>}
    </div>
  );
}
