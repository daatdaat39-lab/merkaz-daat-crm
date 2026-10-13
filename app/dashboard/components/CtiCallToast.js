'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

// התראה-אחרי-שיחה (שלב 5, סוכם מול המשתמש - ה-webhook של 015 נשלח רק
// ב-Hangup, אין לנו webhook על תחילת-שיחה, אז אין הקפצה-אמיתית-באמצע-
// שיחה. זו התראה אחרי שהשיחה כבר הסתיימה). מאזינה ל-cti_call_events
// (migration 0153) באותו דפוס בדיוק כמו NewLeadToast/PendingAutomationWatcher.
// agent_id=null = שידור-למחלקה (כל מי שפתוח על ה-workspace הזה כרגע);
// agent_id מוגדר = מיועד לנציג ספציפי - שאר הטאבים מתעלמים.
export default function CtiCallToast({ workspaceId, userId }) {
  const [toast, setToast] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`cti-call-events-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cti_call_events', filter: `workspace_id=eq.${workspaceId}` },
        async (payload) => {
          const row = payload.new;
          if (row.agent_id && row.agent_id !== userId) return;

          let contactName = null;
          if (row.contact_id) {
            const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', row.contact_id).maybeSingle();
            contactName = contact ? `${contact.first || ''} ${contact.last || ''}`.trim() : null;
          }
          setToast({ contactId: row.contact_id, contactName, phone: row.phone });
          setTimeout(() => setToast(null), 15000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, userId]);

  if (!toast) return null;

  const href = toast.contactId ? `/dashboard/contacts/${toast.contactId}` : '/dashboard/sales/leads';

  return (
    <button
      onClick={() => { router.push(href); setToast(null); }}
      style={{
        position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 500,
        background: '#1d4ed8', color: '#fff', border: '2px solid #3b6fe0', borderRadius: 14,
        padding: '18px 24px', fontSize: 13, cursor: 'pointer', textAlign: 'right',
        boxShadow: '0 12px 40px rgba(29,78,216,0.4), 0 0 0 6px rgba(59,111,224,0.15)',
        display: 'flex', alignItems: 'center', gap: 14, minWidth: 280,
      }}
    >
      <span style={{ fontSize: 26 }}>☎️</span>
      <span>
        <div style={{ fontWeight: 700, fontSize: 15 }}>שיחה נכנסת{toast.contactName ? ` מ${toast.contactName}` : ' - מספר לא מזוהה'}</div>
        <div style={{ fontSize: 12.5, color: '#dbe7fc', marginTop: 3 }}>
          {toast.phone ? `${toast.phone} · ` : ''}{toast.contactId ? 'לחץ לפתיחת הכרטיס' : 'לחץ ליצירת ליד חדש'}
        </div>
      </span>
    </button>
  );
}
