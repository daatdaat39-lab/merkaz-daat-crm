'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { PhoneIcon } from './icons';

// הקפצת-מסך בזמן-אמת - ה-webhook של 015 נרשם גם לאירוע "Calling" (תחילת-
// שיחה/צלצול, לא רק "Hangup"), אז השורה ב-cti_call_events נוצרת ברגע-
// הצלצול עצמו (ר' app/api/webhooks/hallo015-call/route.js). מאזינה
// ל-cti_call_events (migration 0153) באותו דפוס בדיוק כמו
// NewLeadToast/PendingAutomationWatcher.
//
// שני ערוצים (migration 0193, ניתוב לפי שלוחה->נציג):
// (א) ערוץ-אישי (agent_id=eq.userId) - מגיע-ישר-לנציג-הזה בלי-תלות-
//     באיזו-מחלקה-פתוחה-אצלו-כרגע (כל שלוחה שייכת-לאדם-ספציפי, לא-
//     למחלקה - ר' route.js). זה-הערוץ-העיקרי-מעכשיו.
// (ב) ערוץ-שידור-למחלקה (הדפוס-הישן) - רק-לשלוחות-שעדיין-לא-משויכות-
//     לנציג-ספציפי במערכת, ורק-כש-המחלקה-הזו-פתוחה-אצלו-כרגע.
//     agent_id=null = שידור-לכל-מי-שפתוח-על-ה-workspace; agent_id
//     מוגדר = מיועד-לנציג-ספציפי, שאר-הטאבים-מתעלמים (dedup מול א').
export default function CtiCallToast({ workspaceId, userId }) {
  const [toast, setToast] = useState(null);
  const router = useRouter();
  const shownIds = useRef(new Set());

  async function showToast(row) {
    if (shownIds.current.has(row.id)) return;
    shownIds.current.add(row.id);
    const supabase = createClient();
    let contactName = null;
    if (row.contact_id) {
      const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', row.contact_id).maybeSingle();
      contactName = contact ? `${contact.first || ''} ${contact.last || ''}`.trim() : null;
    }
    setToast({ contactId: row.contact_id, contactName, phone: row.phone });
    setTimeout(() => setToast(null), 15000);
  }

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`cti-call-events-agent-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cti_call_events', filter: `agent_id=eq.${userId}` },
        (payload) => showToast(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`cti-call-events-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cti_call_events', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new;
          if (row.agent_id && row.agent_id !== userId) return;
          showToast(row);
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
      <PhoneIcon size={24} style={{ color: '#fff' }} />
      <span>
        <div style={{ fontWeight: 700, fontSize: 15 }}>שיחה נכנסת{toast.contactName ? ` מ${toast.contactName}` : ' - מספר לא מזוהה'}</div>
        <div style={{ fontSize: 12.5, color: '#dbe7fc', marginTop: 3 }}>
          {toast.phone ? `${toast.phone} · ` : ''}{toast.contactId ? 'לחץ לפתיחת הכרטיס' : 'לחץ ליצירת ליד חדש'}
        </div>
      </span>
    </button>
  );
}
