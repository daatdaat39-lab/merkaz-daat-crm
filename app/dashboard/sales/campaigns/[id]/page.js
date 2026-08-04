import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../lib/contactGuards';
import { getPicklistValues } from '../../../lib/picklists';
import { getCampaignStages } from '../../../lib/campaignStages';
import { getExtraFields } from '../../../lib/extraFields';
import CampaignDetailClient from './CampaignDetailClient';

// ניהול קמפיין בודד: הוספת אנשי קשר, סיווג לקטגוריה (חם/קר/תורם גדול),
// שיוך נציג מטפל, וסימון טופל.
export default async function CampaignDetailPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, channel, status, kind, workspace_id, workspaces:workspace_id (name)')
    .eq('id', params.id)
    .single();
  if (!campaign) notFound();

  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/sales/campaigns" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לקמפיינים</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק בעלים או מנהל של המחלקה יכולים לנהל קמפיינים.
        </div>
      </div>
    );
  }

  const [{ data: memberRows }, { data: allContacts }, { data: members }] = await Promise.all([
    supabase
      .from('campaign_contacts')
      .select('id, category, assigned_to, status, contacts:contact_id (id, first, last, phone, email), campaign_dedication_entries (id, dedication_date, dedication_text, note, names, locked_at)')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('contacts')
      .select('id, first, last, phone, email, tags, contact_departments (stage, workspace_id, extra_fields, workspaces:workspace_id (name))')
      .order('first'),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', campaign.workspace_id),
  ]);

  const memberIds = (members || []).map((m) => m.user_id);
  const [{ data: profiles }, categoryRows, campaignStages] = await Promise.all([
    memberIds.length ? supabase.from('profiles').select('id, name').in('id', memberIds) : { data: [] },
    getPicklistValues(supabase, 'campaign_category', campaign.workspace_id),
    campaign.kind === 'dedication' ? { order: [], wonStage: null, labels: {}, colors: {} } : getCampaignStages(supabase, campaign.id),
  ]);
  const categories = categoryRows.map((r) => r.value);
  const extraFields = await getExtraFields(supabase, campaign.workspaces?.name);
  const admin = createAdminClient();
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));
  const agents = (profiles || []).map((p) => ({ id: p.id, name: p.name || emailById[p.id] || 'משתמש' }));

  const rows = (memberRows || []).filter((r) => r.contacts).map((r) => ({
    rowId: r.id,
    contactId: r.contacts.id,
    name: `${r.contacts.first || ''} ${r.contacts.last || ''}`.trim(),
    phone: r.contacts.phone,
    email: r.contacts.email,
    category: r.category || '',
    assignedTo: r.assigned_to || '',
    status: r.status,
    dedications: [...(r.campaign_dedication_entries || [])].sort((a, b) => new Date(a.dedication_date) - new Date(b.dedication_date)),
  }));

  const memberContactIds = new Set(rows.map((r) => r.contactId));
  const availableContacts = (allContacts || [])
    .filter((c) => !memberContactIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: `${c.first || ''} ${c.last || ''}`.trim(),
      phone: c.phone,
      email: c.email,
      tags: c.tags || [],
      departments: (c.contact_departments || []).map((d) => d.workspaces?.name).filter(Boolean),
      extraFields: (c.contact_departments || []).find((d) => d.workspace_id === campaign.workspace_id)?.extra_fields || {},
    }));

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <a href="/dashboard/sales/campaigns" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לקמפיינים</a>
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>{campaign.name}</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {campaign.workspaces?.name}
            {campaign.channel && ` · ערוץ פעולה: ${campaign.channel}`}
            {` · ${rows.length} אנשי קשר`}
          </p>
        </div>
        {campaign.kind !== 'dedication' && (
          <a href={`/dashboard/sales/campaigns/${campaign.id}/stages`} style={{
            fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border, #e5e5e5)',
            borderRadius: 6, padding: '6px 12px', whiteSpace: 'nowrap',
          }}>
            ⚙ ניהול שלבים
          </a>
        )}
      </div>
      <div style={{ marginBottom: 20 }} />
      <CampaignDetailClient
        campaignId={campaign.id}
        campaignKind={campaign.kind}
        workspaceId={campaign.workspace_id}
        isDonationsWorkspace={campaign.workspaces?.name === 'תרומות'}
        extraFields={extraFields}
        initialRows={rows}
        availableContacts={availableContacts}
        agents={agents}
        categories={categories}
        campaignStages={campaignStages}
      />
    </div>
  );
}
