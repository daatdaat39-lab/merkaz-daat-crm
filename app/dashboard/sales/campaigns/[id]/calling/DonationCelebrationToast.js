'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../../../lib/supabase/client';
import { getCelebrationInfo } from '../callQueueActions';

// "מישהו הצליח!" - Realtime על INSERT ל-campaign_call_attempts, מסונן
// לפי campaign_id (עמודה חדשה, migration 0099) - אותו דפוס בדיוק כמו
// NewLeadToast.js. מוצג לכל הטלפנים שפתוחים כרגע על הקמפיין הזה, לא רק
// למי שרשם את השיחה - כדי שההצלחה "תקפוץ לכולם".
export default function DonationCelebrationToast({ campaignId }) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!campaignId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`donation-celebration-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_call_attempts', filter: `campaign_id=eq.${campaignId}` },
        async (payload) => {
          if (payload.new.outcome !== 'donating_now') return;
          const info = await getCelebrationInfo(payload.new.id);
          if (info.error) return;
          setToast(info);
          setTimeout(() => setToast(null), 8000);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 28, insetInlineStart: 28, zIndex: 1200,
        background: '#c8791f', color: '#fff', border: '2px solid #e0954a', borderRadius: 14,
        padding: '18px 24px', fontSize: 13, textAlign: 'right',
        boxShadow: '0 12px 40px rgba(200,121,31,0.45), 0 0 0 6px rgba(224,149,74,0.18)',
        display: 'flex', alignItems: 'center', gap: 14, minWidth: 280,
        animation: 'donationToastIn 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: 30 }}>🎉</span>
      <span>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {toast.contactName || 'מישהו'} תרם/ה{toast.amount ? ` ₪${Number(toast.amount).toLocaleString()}` : ''}!
        </div>
        <div style={{ fontSize: 12.5, color: '#fde9d2', marginTop: 3 }}>כל הכבוד ל{toast.agentName}!</div>
      </span>
      <style>{`
        @keyframes donationToastIn {
          from { transform: translateY(24px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
