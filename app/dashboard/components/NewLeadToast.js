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
          setTimeout(() => setToast(null), 10000);
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
        position: 'fixed', bottom: 28, insetInlineStart: 28, zIndex: 500,
        background: '#1f4d3d', color: '#fff', border: '2px solid #2f7d4f', borderRadius: 14,
        padding: '18px 24px', fontSize: 13, cursor: 'pointer', textAlign: 'right',
        boxShadow: '0 12px 40px rgba(31,77,61,0.45), 0 0 0 6px rgba(47,125,79,0.15)',
        display: 'flex', alignItems: 'center', gap: 14, minWidth: 280,
        animation: 'newLeadToastIn 0.3s ease-out, newLeadToastPulse 1.8s ease-in-out 0.3s 2',
      }}
    >
      <span style={{ fontSize: 30 }}>🎉</span>
      <span>
        <div style={{ fontWeight: 700, fontSize: 16 }}>נכנס ליד חדש!</div>
        <div style={{ fontSize: 13, color: '#d5e9dc', marginTop: 3 }}>{toast.name} · לחץ לצפייה</div>
      </span>
      <style>{`
        @keyframes newLeadToastIn {
          from { transform: translateY(24px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes newLeadToastPulse {
          0%, 100% { box-shadow: 0 12px 40px rgba(31,77,61,0.45), 0 0 0 6px rgba(47,125,79,0.15); }
          50% { box-shadow: 0 12px 40px rgba(31,77,61,0.45), 0 0 0 12px rgba(47,125,79,0.3); }
        }
      `}</style>
    </button>
  );
}
