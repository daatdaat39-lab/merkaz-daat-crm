'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { approvePendingAutomation, rejectPendingAutomation, fetchMyPendingAutomations } from '../lib/pendingAutomationActions';

function describe(item) {
  const contactName = `${item.contact_first || ''} ${item.contact_last || ''}`.trim() || 'איש קשר';
  if (item.action_type === 'send_whatsapp_template') {
    return `לשלוח ל${contactName} הודעת וואטסאפ${item.whatsapp_templates?.name ? ` ("${item.whatsapp_templates.name}")` : ''}?`;
  }
  if (item.action_type === 'send_email_template') {
    return `לשלוח ל${contactName} מייל${item.email_templates?.name ? ` ("${item.email_templates.name}")` : ''}?`;
  }
  if (item.action_type === 'create_task') {
    return `ליצור משימת פולו-אפ ל${contactName}${item.task_title ? ` ("${item.task_title}")` : ''}?`;
  }
  return `לבצע פעולה עבור ${contactName}?`;
}

// מציג הודעה צפה באמצע המסך כשמצטברת אוטומציית שלב חדשה שממתינה
// לאישור הנציג (pending_automations, migration 0056) - גם בזמן אמת
// (Supabase Realtime, אותו דפוס כמו NewLeadToast/ConcurrentInquiryToast)
// וגם נטען מראש בכניסה למערכת, למקרה שהצטברו אוטומציות בזמן שהנציג לא
// היה מחובר. מותקן פעם אחת ב-layout, עובד מכל מקום באתר.
export default function PendingAutomationWatcher({ userId }) {
  const [queue, setQueue] = useState([]);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchMyPendingAutomations().then((items) => setQueue(items));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`pending-automations-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_automations', filter: `agent_id=eq.${userId}` },
        (payload) => {
          setQueue((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const current = queue[0];

  function resolve(action) {
    if (!current) return;
    setIsPending(true);
    const fn = action === 'approve' ? approvePendingAutomation : rejectPendingAutomation;
    fn(current.id).finally(() => {
      setIsPending(false);
      setQueue((prev) => prev.slice(1));
    });
  }

  if (!current) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        background: 'var(--bg, #fff)', borderRadius: 14, padding: 26, width: '100%', maxWidth: 380,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⚡</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted, #9b9b9b)', textTransform: 'uppercase', marginBottom: 6 }}>
          אוטומציה ממתינה לאישור{current.workspaces?.name ? ` · ${current.workspaces.name}` : ''}
        </div>
        {current.stage_label && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            הליד עבר לשלב "{current.stage_label}"
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, lineHeight: 1.5 }}>
          {describe(current)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => resolve('approve')}
            disabled={isPending}
            style={{ flex: 1, background: '#1f4d3d', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            כן, לבצע
          </button>
          <button
            type="button"
            onClick={() => resolve('reject')}
            disabled={isPending}
            style={{ flex: 1, background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer' }}
          >
            לא, לדלג
          </button>
        </div>
        {queue.length > 1 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>ועוד {queue.length - 1} ממתינות אחריה</div>
        )}
      </div>
    </div>
  );
}
