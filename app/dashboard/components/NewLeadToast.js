'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

// מאזין בזמן אמת (Supabase Realtime) לשיוכי מחלקה חדשים במחלקה הפעילה
// של המשתמש - כלומר לידים חדשים - ומציג ריבוע קופץ. לחיצה עליו עוברת
// למסך הלידים. עובד מכל מקום באתר, לא רק במסך הלידים עצמו.
export default function NewLeadToast({ workspaceId }) {
  const [toast, setToast] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`new-leads-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_departments', filter: `workspace_id=eq.${workspaceId}` },
        async (payload) => {
          const { data: contact } = await supabase
            .from('contacts')
            .select('first, last')
            .eq('id', payload.new.contact_id)
            .single();
          setToast({ name: contact ? `${contact.first} ${contact.last || ''}`.trim() : 'ליד חדש' });
          setTimeout(() => setToast(null), 8000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  if (!toast) return null;

  return (
    <button
      onClick={() => { router.push('/dashboard/sales/leads'); setToast(null); }}
      style={{
        position: 'fixed', bottom: 24, insetInlineStart: 24, zIndex: 500,
        background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 10,
        padding: '14px 18px', fontSize: 13, cursor: 'pointer', textAlign: 'right',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 10,
        animation: 'newLeadToastIn 0.25s ease-out',
      }}
    >
      <span style={{ fontSize: 20 }}>🎉</span>
      <span>
        <div style={{ fontWeight: 600 }}>נכנס ליד חדש</div>
        <div style={{ fontSize: 11.5, color: '#c0c0c0', marginTop: 2 }}>{toast.name} · לחץ לצפייה</div>
      </span>
      <style>{`
        @keyframes newLeadToastIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </button>
  );
}
