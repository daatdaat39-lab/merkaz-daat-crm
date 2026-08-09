'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approvePendingAutomation, rejectPendingAutomation } from '../lib/pendingAutomationActions';

const ACTION_LABEL = {
  send_whatsapp_template: '💬 וואטסאפ',
  send_email_template: '✉️ מייל',
  create_task: '✅ משימה',
};

// שורת אוטומציית שלב שממתינה לאישור - נשמרת ברשימה הזו גם אם ההודעה
// הצפה (PendingAutomationWatcher.js) כבר נסגרה/הוחמצה, כדי שאפשר יהיה
// לחזור ולטפל בה מאוחר יותר.
export default function PendingAutomationRow({ item }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function resolve(action) {
    setError(null);
    startTransition(async () => {
      const fn = action === 'approve' ? approvePendingAutomation : rejectPendingAutomation;
      const res = await fn(item.id);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  const contactName = `${item.contact_first || ''} ${item.contact_last || ''}`.trim() || 'איש קשר';
  const detail = item.action_type === 'send_whatsapp_template' ? item.whatsapp_templates?.name
    : item.action_type === 'send_email_template' ? item.email_templates?.name
    : item.task_title;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, background: '#fffbeb', color: '#d97706', borderRadius: 999, padding: '3px 10px' }}>
        {ACTION_LABEL[item.action_type] || item.action_type}
      </span>
      <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
        <div>{contactName}{item.stage_label ? ` · עבר לשלב "${item.stage_label}"` : ''}</div>
        {detail && <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{detail}</div>}
        <div style={{ color: 'var(--text-muted, #9b9b9b)', fontSize: 11 }}>{item.workspaces?.name} · {new Date(item.created_at).toLocaleString('he-IL')}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => resolve('approve')} disabled={isPending} style={{ background: '#1f4d3d', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
          אישור
        </button>
        <button type="button" onClick={() => resolve('reject')} disabled={isPending} style={{ background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
          דחייה
        </button>
      </div>
      {error && <div style={{ width: '100%', color: '#b23b2f', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
