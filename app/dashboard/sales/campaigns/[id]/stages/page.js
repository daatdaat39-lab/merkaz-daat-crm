import { createClient } from '../../../../../../lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../../lib/contactGuards';
import CampaignStagesClient from './CampaignStagesClient';

// ניהול שלבי pipeline לקמפיין בודד (מיגרציה 0039) - עותק מפושט של
// settings/pipelines/page.js, הפעם per-קמפיין במקום per-מחלקה. נתון
// משותף לצוות (לא העדפה אישית), לכן דורש owner/admin של המחלקה - ר'
// stages/actions.js.
export default async function CampaignStagesPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, workspace_id, workspaces:workspace_id (name)')
    .eq('id', params.id)
    .single();
  if (!campaign) notFound();

  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href={`/dashboard/sales/campaigns/${campaign.id}`} style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לקמפיין</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin של המחלקה יכול לערוך שלבי קמפיין.
        </div>
      </div>
    );
  }

  const { data: stageRows } = await supabase
    .from('campaign_stages')
    .select('id, stage_key, label, color_bg, color_fg, sort_order, is_won_stage')
    .eq('campaign_id', campaign.id)
    .order('sort_order', { ascending: true, nullsFirst: false });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <a href={`/dashboard/sales/campaigns/${campaign.id}`} style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לקמפיין</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>שלבי הקמפיין — {campaign.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        {campaign.workspaces?.name} · עריכת שלבי התהליך של הקמפיין הזה בלבד - הוספה, מחיקה, שינוי תווית/צבע, קביעת שלב-ניצחון. המפתח הטכני קבוע לאחר יצירה.
      </p>
      <CampaignStagesClient campaignId={campaign.id} initialStages={stageRows || []} />
    </div>
  );
}
