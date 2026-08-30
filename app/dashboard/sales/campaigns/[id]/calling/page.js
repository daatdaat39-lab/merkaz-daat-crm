import { createClient } from '../../../../../../lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../../lib/contactGuards';
import { getCampaignStages } from '../../../../lib/campaignStages';
import CallQueueClient from './CallQueueClient';

// דף תור-השיחות לקמפיין בודד - שער-הרשאה נפרד מ-[id]/page.js (חבר-
// מחלקה בכל תפקיד, לא רק owner/admin - ר' callQueueActions.js).
export default async function CampaignCallingPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign } = await supabase.from('campaigns').select('id, name, workspace_id, open_for_telemarketing').eq('id', params.id).single();
  if (!campaign) notFound();

  const [allowed, { data: membership }] = await Promise.all([
    isMemberOfWorkspace(supabase, user.id, campaign.workspace_id),
    supabase.from('workspace_members').select('role').eq('user_id', user.id).eq('workspace_id', campaign.workspace_id).maybeSingle(),
  ]);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/sales/campaigns/calling" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          אין לך גישה לקמפיין הזה.
        </div>
      </div>
    );
  }

  // שער-קמפיין (0096) חל רק על תפקיד "טלפן" הנעול בפועל - מנהל/נציג
  // רגיל שבודקים את הקמפיין ממשיכים לראות אותו גם כשהוא "סגור", אחרת
  // אי אפשר לבדוק קמפיין לפני שפותחים אותו לטלפנים.
  const isLockedTelemarketer = membership?.role === 'telemarketer';
  if (isLockedTelemarketer && !campaign.open_for_telemarketing) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/sales/campaigns/calling" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          הקמפיין הזה סגור לטלפניה כרגע.
        </div>
      </div>
    );
  }

  const [campaignStages, { data: whatsappTemplates }] = await Promise.all([
    getCampaignStages(supabase, campaign.id),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
  ]);
  const stages = campaignStages.order.map((key) => ({ stageKey: key, label: campaignStages.labels[key], isWon: key === campaignStages.wonStage }));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/sales/campaigns/calling" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לרשימת הקמפיינים</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 20px', fontSize: 20 }}>📱 {campaign.name}</h1>
      <CallQueueClient
        campaignId={campaign.id} stages={stages} workspaceId={campaign.workspace_id} whatsappTemplates={whatsappTemplates || []}
        isLockedTelemarketer={isLockedTelemarketer}
      />
    </div>
  );
}
