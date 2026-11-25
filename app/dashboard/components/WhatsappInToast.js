'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { WhatsAppIcon } from './icons';

// הקפצת-התראה-חיה להודעת-WhatsApp נכנסת, לפי השיחה (whatsapp_conversations,
// migration 0196): מוצגת לבעל השיחה; שיחה בלי בעלים - לכל חברי המחלקה שלה;
// מספר לא מזוהה (בלי מחלקה) - לכולם. בנוסף, כל שינוי בשיחות מרענן את
// הנתונים שבשלד (מונה הפעמון) בלי לחכות לניווט.
export default function WhatsappInToast({ userId, workspaceIds = [] }) {
  const [toast, setToast] = useState(null);
  const router = useRouter();
  const workspaceKey = workspaceIds.join(',');
  const lastShown = useRef({});

  useEffect(() => {
    const supabase = createClient();
    const mine = new Set(workspaceKey ? workspaceKey.split(',') : []);
    let refreshTimer = null;
    let hideTimer = null;

    const channel = supabase
      .channel('whatsapp-conversations-toast')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, async (payload) => {
        const row = payload.new;
        if (!row?.id) return;
        if (row.workspace_id && !mine.has(row.workspace_id)) return;

        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => router.refresh(), 1500);

        // טוסט רק להודעה נכנסת חדשה (לא לשינוי בעלים/סטטוס על אותה הודעה)
        // "חדשה" = נכנסה ברבע השעה האחרונה (המשיכה מ-InforU רצה כל 5 דקות, אז
        // הודעה מגיעה באיחור של כמה דקות); אחרת זה עדכון על שיחה ישנה (קישור
        // לאיש קשר, "אני מטפל") ולא סיבה להקפיץ התראה.
        if (row.status !== 'waiting_us' || row.last_direction !== 'in' || !row.last_inbound_at) return;
        if (Date.now() - new Date(row.last_inbound_at).getTime() > 15 * 60000) return;
        if (lastShown.current[row.id] === row.last_inbound_at) return;
        lastShown.current[row.id] = row.last_inbound_at;
        if (row.assigned_to && row.assigned_to !== userId) return;

        let contactName = null;
        if (row.contact_id) {
          const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', row.contact_id).maybeSingle();
          contactName = contact ? `${contact.first || ''} ${contact.last || ''}`.trim() : null;
        }
        setToast({ conversationId: row.id, contactName, phone: row.phone, message: row.last_message_preview });
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setToast(null), 15000);
      })
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(hideTimer);
      supabase.removeChannel(channel);
    };
  }, [workspaceKey, userId, router]);

  if (!toast) return null;

  return (
    <button
      onClick={() => { router.push(`/dashboard/whatsapp?c=${toast.conversationId}`); setToast(null); }}
      style={{
        position: 'fixed', bottom: 28, insetInlineEnd: 304, zIndex: 500,
        background: '#15803d', color: '#fff', border: '2px solid #22a85c', borderRadius: 14,
        padding: '18px 24px', fontSize: 13, cursor: 'pointer', textAlign: 'right',
        boxShadow: '0 12px 40px rgba(21,128,61,0.4), 0 0 0 6px rgba(34,168,92,0.15)',
        display: 'flex', alignItems: 'center', gap: 14, minWidth: 280, maxWidth: 360,
      }}
    >
      <WhatsAppIcon size={24} style={{ color: '#fff', flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>הודעת WhatsApp{toast.contactName ? ` מ${toast.contactName}` : ' - מספר לא מזוהה'}</div>
        <div style={{
          fontSize: 12.5, color: '#dcf5e3', marginTop: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {toast.message || (toast.phone ? toast.phone : 'לחץ לפתיחה')}
        </div>
      </span>
    </button>
  );
}
