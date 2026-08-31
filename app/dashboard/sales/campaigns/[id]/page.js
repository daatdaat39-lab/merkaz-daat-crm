import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../lib/contactGuards';
import { getPicklistValues } from '../../../lib/picklists';
import { getCampaignStages } from '../../../lib/campaignStages';
import { getExtraFields, getAllExtraFields } from '../../../lib/extraFields';
import { getAllPipelines } from '../../../lib/pipelines';
import CampaignDetailClient from './CampaignDetailClient';
import OpenForTelemarketingToggle from './OpenForTelemarketingToggle';

// ניהול קמפיין בודד: הוספת אנשי קשר, סיווג לקטגוריה (חם/קר/תורם גדול),
// שיוך נציג מטפל, וסימון טופל.
export default async function CampaignDetailPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // open_for_telemarketing (migration 0096) - נשלף בנפרד עם נפילה-רכה:
  // אם המיגרציה עוד לא רצה בסביבה הזו, לא רוצים שהעמוד כולו יקרוס ל-404
  // (כבר קרה בפועל - ר' commit history) - רק המתג עצמו לא יעבוד עד אז.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, channel, status, kind, workspace_id, workspaces:workspace_id (name)')
    .eq('id', params.id)
    .single();
  if (!campaign) notFound();

  const { data: telemarketingRow } = await supabase.from('campaigns').select('open_for_telemarketing').eq('id', params.id).maybeSingle();
  campaign.open_for_telemarketing = telemarketingRow?.open_for_telemarketing ?? false;

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

  // שתי השאילתות הבאות פאגינות ידנית ב-1000 (מגבלת ברירת המחדל של
  // PostgREST) - אומת בפועל: קמפיין "דעת" עם 1443 אנשי קשר אמיתיים הציג
  // רק 1000 בטבלה, ו-fetchAllContacts (רשימת "הוספת אנשי קשר") היה
  // מוגבל ל-1000 מתוך 6575+ אנשי קשר במערכת (לא מוצא אף אחד מעבר לזה
  // בחיפוש). מיון נעשה ב-JS אחרי איסוף כל הדפים, לא ב-SQL - כדי לא
  // להסתמך על יציבות סדר בין קריאות range() נפרדות.
  async function fetchAllCampaignMembers() {
    const pageSize = 1000;
    let from = 0;
    let all = [];
    while (true) {
      const { data } = await supabase
        .from('campaign_contacts')
        .select('id, category, assigned_to, status, mapping_decision, note, in_call_queue, created_at, contacts:contact_id (id, first, last, phone, email)')
        .eq('campaign_id', campaign.id)
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  async function fetchAllContactsForCampaign() {
    const pageSize = 1000;
    let from = 0;
    let all = [];
    while (true) {
      const { data } = await supabase
        .from('contacts')
        .select('id, first, last, phone, email, tags, contact_departments (stage, workspace_id, extra_fields, workspaces:workspace_id (name))')
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all.sort((a, b) => (a.first || '').localeCompare(b.first || '', 'he'));
  }

  const [memberRows, allContacts, { data: members }] = await Promise.all([
    fetchAllCampaignMembers(),
    fetchAllContactsForCampaign(),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', campaign.workspace_id),
  ]);

  const memberIds = (members || []).map((m) => m.user_id);
  const [{ data: profiles }, categoryRows, campaignStages] = await Promise.all([
    memberIds.length ? supabase.from('profiles').select('id, name').in('id', memberIds) : { data: [] },
    getPicklistValues(supabase, 'campaign_category', campaign.workspace_id),
    getCampaignStages(supabase, campaign.id),
  ]);
  const categories = categoryRows.map((r) => r.value);
  const extraFields = await getExtraFields(supabase, campaign.workspaces?.name);
  const [extraFieldsByWorkspace, { byWorkspace: pipelinesByWorkspace }] = await Promise.all([
    getAllExtraFields(supabase),
    getAllPipelines(supabase),
  ]);
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
    mappingDecision: r.mapping_decision || '',
    note: r.note || '',
    inCallQueue: r.in_call_queue !== false,
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
      departmentDetails: (c.contact_departments || []).map((d) => ({
        name: d.workspaces?.name, stage: d.stage, extraFields: d.extra_fields || {},
      })),
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <OpenForTelemarketingToggle campaignId={campaign.id} initialOpen={campaign.open_for_telemarketing} />
          <a href={`/dashboard/sales/campaigns/${campaign.id}/calling-dashboard`} style={{
            fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border, #e5e5e5)',
            borderRadius: 6, padding: '6px 12px', whiteSpace: 'nowrap',
          }}>
            📊 דשבורד טלפניה
          </a>
          <a href={`/dashboard/sales/campaigns/${campaign.id}/stages`} style={{
            fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border, #e5e5e5)',
            borderRadius: 6, padding: '6px 12px', whiteSpace: 'nowrap',
          }}>
            ⚙ ניהול שלבים
          </a>
        </div>
      </div>
      <div style={{ marginBottom: 20 }} />
      <CampaignDetailClient
        campaignId={campaign.id}
        workspaceId={campaign.workspace_id}
        isDonationsWorkspace={campaign.workspaces?.name === 'תרומות'}
        extraFields={extraFields}
        extraFieldsByWorkspace={extraFieldsByWorkspace}
        pipelinesByWorkspace={pipelinesByWorkspace}
        initialRows={rows}
        availableContacts={availableContacts}
        agents={agents}
        categories={categories}
        campaignStages={campaignStages}
      />
    </div>
  );
}
