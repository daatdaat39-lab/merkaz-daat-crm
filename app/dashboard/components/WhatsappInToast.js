'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { WhatsAppIcon } from './icons';

// הקפצת-התראה-חיה להודעת-WhatsApp נכנסת - אותו דפוס בדיוק כמו
// CtiCallToast (שיחות-נכנסות): מאזינה ל-INSERT על sent_whatsapp עם
// direction='in' בתוך ה-workspace הפעיל, ואז בודקת מי-הנציג-המטפל
// באיש-הקשר הזה (contact_departments.agent_id) - אם-יש-נציג-ספציפי
// ושונה-ממני, לא-מציגה; אם-אין-נציג-מוגדר (null), מציגה-לכולם (שידור-
// למחלקה, בדיוק כמו agent_id=null ב-cti_call_events).
export default function WhatsappInToast({ workspaceId, userId }) {
  const [toast, setToast] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`sent-whatsapp-in-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sent_whatsapp', filter: `workspace_id=eq.${workspaceId}` },
        async (payload) => {
          const row = payload.new;
          if (row.direction !== 'in') return;

          let contactName = null;
          if (row.contact_id) {
            const [{ data: contact }, { data: dept }] = await Promise.all([
              supabase.from('contacts').select('first, last').eq('id', row.contact_id).maybeSingle(),
              supabase.from('contact_departments').select('agent_id').eq('contact_id', row.contact_id).eq('workspace_id', workspaceId).maybeSingle(),
            ]);
            if (dept?.agent_id && dept.agent_id !== userId) return;
            contactName = contact ? `${contact.first || ''} ${contact.last || ''}`.trim() : null;
          }

          setToast({ contactId: row.contact_id, contactName, phone: row.phone, message: row.message });
          setTimeout(() => setToast(null), 15000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, userId]);

  if (!toast) return null;

  const href = toast.contactId ? `/dashboard/contacts/${toast.contactId}` : '/dashboard/whatsapp';

  return (
    <button
      onClick={() => { router.push(href); setToast(null); }}
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
