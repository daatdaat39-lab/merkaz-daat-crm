import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../lib/contactGuards';
import { getPicklistValues } from '../../../lib/picklists';
import CampaignDetailClient from './CampaignDetailClient';

// ניהול קמפיין בודד: הוספת אנשי קשר, סיווג לקטגוריה (חם/קר/תורם גדול),
// שיוך נציג מטפל, וסימון טופל.
export default async function CampaignDetailPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, channel, status, workspace_id, workspaces:workspace_id (name)')
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
      .select('id, category, assigned_to, status, contacts:contact_id (id, first, last, phone, email)')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('contacts')
      .select('id, first, last, phone, email, tags, contact_departments (stage, workspaces:workspace_id (name))')
      .order('first'),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', campaign.workspace_id),
  ]);

  const memberIds = (members || []).map((m) => m.user_id);
  const [{ data: profiles }, categoryRows] = await Promise.all([
    memberIds.length ? supabase.from('profiles').select('id, name').in('id', memberIds) : { data: [] },
    getPicklistValues(supabase, 'campaign_category', campaign.workspace_id),
  ]);
  const categories = categoryRows.map((r) => r.value);
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
    }));

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/sales/campaigns" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לקמפיינים</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>{campaign.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        {campaign.workspaces?.name}
        {campaign.channel && ` · ערוץ פעולה: ${campaign.channel}`}
        {` · ${rows.length} אנשי קשר`}
      </p>
      <CampaignDetailClient
        campaignId={campaign.id}
        initialRows={rows}
        availableContacts={availableContacts}
        agents={agents}
        categories={categories}
      />
    </div>
  );
}
