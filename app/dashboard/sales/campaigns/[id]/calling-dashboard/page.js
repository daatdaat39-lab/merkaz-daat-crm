import { createClient } from '../../../../../../lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../../lib/contactGuards';
import { getCallDashboardStats, getDonationAttributionsForDashboard } from '../callDashboardActions';
import CallDashboardClient from './CallDashboardClient';

// דשבורד טלפניה למנהל - עמוד נפרד (לא טאב בתוך [id]/page.js) כדי לא
// לגרור את השליפה הכבדה של עמוד-הניהול (כל 6,000+ השורות) כשמנהל רק
// רוצה לבדוק מספרים.
export default async function CallDashboardPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign } = await supabase.from('campaigns').select('id, name, workspace_id').eq('id', params.id).single();
  if (!campaign) notFound();

  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href={`/dashboard/sales/campaigns/${campaign.id}`} style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: 'var(--amber)' }}>
          רק בעלים או מנהל של המחלקה יכולים לראות דשבורד זה.
        </div>
      </div>
    );
  }

  const [stats, donations] = await Promise.all([
    getCallDashboardStats(campaign.id),
    getDonationAttributionsForDashboard(campaign.id),
  ]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href={`/dashboard/sales/campaigns/${campaign.id}`} style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לקמפיין</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 20px', fontSize: 20 }}>📊 דשבורד טלפניה - {campaign.name}</h1>
      {stats.error ? (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: 'var(--red)' }}>{stats.error}</div>
      ) : (
        <CallDashboardClient campaignId={campaign.id} stats={stats} donationsByAgent={donations?.byAgent || []} />
      )}
    </div>
  );
}
