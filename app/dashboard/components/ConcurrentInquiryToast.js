'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

// מאזין בזמן אמת לפניות חדשות (lead_inquiries) על שיוכי מחלקה שכבר
// מטופלים ע"י נציג אחר - כדי להתריע לנציג הזה "מישהו אחר כבר מטפל
// באיש הקשר הזה, והוא בדיוק פנה שוב". lead_inquiries לא מחזיקה
// workspace_id ישירות (רק contact_department_id) - לכן קודם טוענים
// מראש את סט שיוכי-המחלקה של ה-workspace הנוכחי (id + agent_id),
// ואז מסננים בצד לקוח על ה-payload שמגיע מה-INSERT הגולמי.
export default function ConcurrentInquiryToast({ workspaceId, userId }) {
  const [toast, setToast] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!workspaceId || !userId) return;
    const supabase = createClient();
    let departmentAgentById = {};

    async function loadDepartments() {
      const { data } = await supabase
        .from('contact_departments')
        .select('id, contact_id, agent_id')
        .eq('workspace_id', workspaceId);
      departmentAgentById = Object.fromEntries((data || []).map((r) => [r.id, r]));
    }
    loadDepartments();

    const channel = supabase
      .channel(`concurrent-inquiry-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_inquiries' },
        async (payload) => {
          const dept = departmentAgentById[payload.new.contact_department_id];
          if (!dept) return; // לא מהמחלקה הנוכחית, או שיוך חדש שעדיין לא נטען
          if (!dept.agent_id || dept.agent_id === userId) return; // לא מטופל, או מטופל ע"י המשתמש הנוכחי עצמו

          const { data: contact } = await supabase.from('contacts').select('first, last').eq('id', dept.contact_id).single();
          const { data: agentProfile } = await supabase.from('profiles').select('name').eq('id', dept.agent_id).single();
          setToast({
            contactId: dept.contact_id,
            name: contact ? `${contact.first} ${contact.last || ''}`.trim() : 'איש קשר',
            agentName: agentProfile?.name || 'נציג אחר',
          });
          setTimeout(() => setToast(null), 12000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, userId]);

  if (!toast) return null;

  return (
    <button
      onClick={() => { router.push(`/dashboard/contacts/${toast.contactId}`); setToast(null); }}
      style={{
        position: 'fixed', bottom: 110, insetInlineStart: 28, zIndex: 500,
        background: '#7c2d12', color: '#fff', border: '2px solid #c2410c', borderRadius: 14,
        padding: '16px 22px', fontSize: 13, cursor: 'pointer', textAlign: 'right',
        boxShadow: '0 12px 40px rgba(124,45,18,0.4)', display: 'flex', alignItems: 'center', gap: 12, minWidth: 280,
      }}
    >
      <span style={{ fontSize: 26 }}>⚠</span>
      <span>
        <div style={{ fontWeight: 700, fontSize: 14 }}>פנייה חדשה מאיש קשר בטיפול</div>
        <div style={{ fontSize: 12.5, color: '#fed7aa', marginTop: 3 }}>{toast.name} · כבר מטופל ע"י {toast.agentName}</div>
      </span>
    </button>
  );
}
