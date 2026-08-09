import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import LeadSourcesClient from './LeadSourcesClient';

// מסך "מקורות לידים" (migration 0057) - שלושה חלקים לכל מחלקה: חיבורי
// מייל נכנס/יוצא (חושף את email_connections/OAuth הקיימים, שעד עכשיו
// לא היה להם שום ממשק), שיוך מייל+כלל ניתוב לקמפיינים, ורשימת מקורות
// (מחליף את SOURCE_LINK_MAP הקשיח בקוד). owner/admin בלבד.
export default async function LeadSourcesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לנהל מקורות לידים.
        </div>
      </div>
    );
  }

  const { data: workspaces } = await supabase.from('workspaces').select('id, name').order('created_at', { ascending: true });

  const [{ data: connections }, { data: campaigns }, { data: leadSources }] = await Promise.all([
    supabase.from('email_connections').select('id, workspace_id, campaign_id, purpose, email_address, last_checked_at'),
    supabase.from('campaigns').select('id, workspace_id, name, status, email_connection_id, route_match_text').order('created_at', { ascending: false }),
    supabase.from('lead_sources').select('id, workspace_id, name, link_pattern').order('created_at', { ascending: false }),
  ]);

  const connectionsByWorkspace = {};
  const connectionsByCampaign = {};
  for (const c of connections || []) {
    if (c.campaign_id) {
      connectionsByCampaign[c.campaign_id] = c;
    } else {
      connectionsByWorkspace[c.workspace_id] = connectionsByWorkspace[c.workspace_id] || {};
      connectionsByWorkspace[c.workspace_id][c.purpose] = c;
    }
  }

  const campaignsByWorkspace = {};
  for (const c of campaigns || []) {
    campaignsByWorkspace[c.workspace_id] = campaignsByWorkspace[c.workspace_id] || [];
    campaignsByWorkspace[c.workspace_id].push(c);
  }

  const leadSourcesByWorkspace = {};
  for (const s of leadSources || []) {
    leadSourcesByWorkspace[s.workspace_id] = leadSourcesByWorkspace[s.workspace_id] || [];
    leadSourcesByWorkspace[s.workspace_id].push(s);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>מקורות לידים</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        חיבורי מייל נכנס/יוצא לכל מחלקה, שיוך מייל לקמפיינים, ורשימת מקורות/קישורים לכל מחלקה.
      </p>
      <LeadSourcesClient
        workspaces={workspaces || []}
        connectionsByWorkspace={connectionsByWorkspace}
        connectionsByCampaign={connectionsByCampaign}
        campaignsByWorkspace={campaignsByWorkspace}
        leadSourcesByWorkspace={leadSourcesByWorkspace}
      />
    </div>
  );
}
