'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignAgent } from './contacts/actions';

// בורר נציג מהיר בתוך שורת ווידג'ט בדשבורד (למשל "דורש טיפול") - מאפשר
// למנהל להקצות ישירות משם, בלי לפתוח את הכרטיס. עוצר הפצת קליק כדי
// שלא יפעיל ניווט של קישור עוטף (אם יש).
export default function QuickAssignSelect({ contactId, workspaceId, agents = [], currentAgentId }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(e) {
    const value = e.target.value;
    startTransition(async () => {
      await assignAgent(contactId, workspaceId, value || null);
      router.refresh();
    });
  }

  return (
    <select
      value={currentAgentId || ''}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      disabled={isPending}
      style={{ fontSize: 11, border: '1px solid #e5e5e5', borderRadius: 4, padding: '2px 6px', background: 'var(--bg)' }}
    >
      <option value="">הקצה נציג...</option>
      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
