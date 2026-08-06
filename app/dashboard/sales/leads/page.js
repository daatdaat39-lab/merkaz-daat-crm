import Link from 'next/link';
import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getExtraFields } from '../../lib/extraFields';
import { getPipeline } from '../../lib/pipelines';
import { getPicklistValues } from '../../lib/picklists';
import AddContactForm from '../../contacts/AddContactForm';
import LeadsBoard from './LeadsBoard';
import AdvancedInquiriesBanner from './AdvancedInquiriesBanner';
import { groupTagsByDepartment } from '../../lib/tagGroups';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import { getCampaignStages } from '../../lib/campaignStages';

const RECENT_INQUIRY_DAYS = 3;

export default async function SalesLeadsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, workspaces:current_workspace_id (name)')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;
  const workspaceName = profile?.workspaces?.name;
  const pipeline = await getPipeline(supabase, workspaceName);
  const extraFields = await getExtraFields(supabase, workspaceName);
  const closeReasonRows = await getPicklistValues(supabase, 'close_reason', null);
  const closeReasons = closeReasonRows.length ? closeReasonRows.map((r) => r.value) : undefined;

  let leads = [];
  let agents = [];
  let existingElsewhereIds = new Set();
  let advancedInquiries = [];
  if (workspaceId) {
    // טוענים את כל השלבים (לא רק leadStages) - הלשוניות ב-LeadsBoard
    // (פתוחים/בתהליך/הצליחו/נפלו) מסננות בצד לקוח, כמו contacts/page.js
    const { data } = await supabase
      .from('contact_departments')
      .select('id, stage, agent_id, last_activity_at, extra_fields, created_by_manager, contacts:contact_id (id, first, last, phone, email, source, dept, tags, frozen), lead_inquiries (reason, created_at)')
      .eq('workspace_id', workspaceId)
      // לידים שממתינים לאישור המנהל לא מוצגים לנציגים - ר' sales/pending
      .eq('approval_status', 'approved')
      .order('last_activity_at', { ascending: false });
    leads = (data || [])
      .filter((row) => row.contacts)
      .map((row) => {
        const inquiries = [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return {
          ...row.contacts,
          departmentRowId: row.id, stage: row.stage, agent_id: row.agent_id, last_activity_at: row.last_activity_at,
          extra_fields: row.extra_fields || {},
          createdByManager: !!row.created_by_manager,
          latestReason: inquiries[0]?.reason || null,
          inquiryCount: inquiries.length,
        };
      });

    // אין קשר-מפתח (FK) בין workspace_members ל-profiles במסד, אז לא ניתן
    // לבקש join מקונן אחד ישיר (profiles חוזר ריק תמיד) - שולפים בשתי שאילתות
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);
    const memberIds = (members || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    agents = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));

    // "איש קשר קיים" - האם הליד הזה כבר משויך גם למחלקה אחרת (לא רק זו),
    // כדי שנציג ידע שזה לא אדם זר לגמרי אלא מישהו שכבר מוכר למערכת
    if (leads.length) {
      const { data: otherDeptRows } = await supabase
        .from('contact_departments')
        .select('contact_id, workspace_id')
        .in('contact_id', leads.map((l) => l.id))
        .neq('workspace_id', workspaceId);
      existingElsewhereIds = new Set((otherDeptRows || []).map((r) => r.contact_id));
      leads = leads.map((l) => ({ ...l, existingElsewhere: existingElsewhereIds.has(l.id) }));
    }

    // פניות חדשות מאנשי קשר שכבר התקדמו מעבר לשלבי הליד המוקדמים (למשל
    // "תלמיד פעיל"/"בוגר"/"תורם פעיל") באותה מחלקה - אלה לא מופיעים
    // ברשימת הלידים הרגילה (מסוננת לפי leadStages בלבד), אבל פנייה חדשה
    // מהם עדיין ראויה לתשומת לב, בלי לשנות את השלב המתקדם שלהם.
    const nonLeadStages = pipeline.order.filter((s) => !pipeline.leadStages.includes(s));
    const recentCutoff = new Date(Date.now() - RECENT_INQUIRY_DAYS * 86400000).toISOString();
    const { data: advancedRows } = await supabase
      .from('contact_departments')
      .select('id, stage, contacts:contact_id (id, first, last), lead_inquiries!inner (id, reason, note, created_at, dismissed_at)')
      .eq('workspace_id', workspaceId)
      .in('stage', nonLeadStages)
      .gte('lead_inquiries.created_at', recentCutoff)
      .is('lead_inquiries.dismissed_at', null);
    advancedInquiries = (advancedRows || [])
      .filter((row) => row.contacts)
      .map((row) => {
        const latest = [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return { contactId: row.contacts.id, name: `${row.contacts.first} ${row.contacts.last}`, stage: row.stage, reason: latest?.reason, createdAt: latest?.created_at, inquiryId: latest?.id };
      })
      .filter((a) => a.inquiryId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const [{ data: workspaces }, { data: tagRows }, { data: sendConnections }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('contacts').select('tags, contact_departments (workspaces:workspace_id (name))'),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
  ]);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const tagGroups = groupTagsByDepartment(
    (tagRows || []).map((c) => ({ tags: c.tags, departments: (c.contact_departments || []).map((d) => ({ name: d.workspaces?.name })) }))
  );

  const overdueCount = leads.filter((l) => pipeline.leadStages.includes(l.stage) && l.last_activity_at && (Date.now() - new Date(l.last_activity_at).getTime()) / 3600000 >= 24).length;

  // מונה לידים ממתינים לאישור - הקישור לתיבה מוצג רק לבעלים/מנהל המחלקה
  const isManager = workspaceId ? await isManagerOfWorkspace(supabase, user.id, workspaceId) : false;
  let pendingCount = 0;
  if (isManager && workspaceId) {
    const { count } = await supabase
      .from('contact_departments')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('approval_status', 'pending');
    pendingCount = count || 0;
  }

  // לידים מקמפיינים פעילים (לא הקדשה) - טבלה נפרדת לכל קמפיין. נציג
  // רגיל רואה רק מה שהוקצה לו; מנהל רואה את כל חברי הקמפיין
  let campaignLeadGroups = [];
  if (workspaceId) {
    const { data: activeCampaigns } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .neq('kind', 'dedication')
      .eq('status', 'active');
    if (activeCampaigns?.length) {
      const campaignIds = activeCampaigns.map((c) => c.id);
      let query = supabase
        .from('campaign_contacts')
        .select('id, campaign_id, status, assigned_to, contacts:contact_id (id, first, last, phone, email)')
        .in('campaign_id', campaignIds);
      if (!isManager) query = query.eq('assigned_to', user.id);
      const { data: memberRows } = await query;
      const stagesByCampaign = Object.fromEntries(
        await Promise.all(campaignIds.map(async (id) => [id, await getCampaignStages(supabase, id)]))
      );
      campaignLeadGroups = activeCampaigns
        .map((c) => ({
          campaignId: c.id,
          campaignName: c.name,
          stages: stagesByCampaign[c.id],
          rows: (memberRows || [])
            .filter((r) => r.campaign_id === c.id && r.contacts)
            .map((r) => ({
              rowId: r.id, contactId: r.contacts.id, name: `${r.contacts.first || ''} ${r.contacts.last || ''}`.trim(),
              phone: r.contacts.phone, email: r.contacts.email, status: r.status, assignedTo: r.assigned_to,
            })),
        }))
        .filter((g) => g.rows.length > 0);
    }
  }

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>לידים</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            {leads.filter((l) => pipeline.leadStages.includes(l.stage)).length} לידים פתוחים, מחולקים לתת-קטגוריות
            {overdueCount > 0 && (
              <span style={{ color: 'var(--danger, #a3392f)', fontWeight: 600 }}> · ⚠ {overdueCount} לידים ללא טיפול מעל 24 שעות</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isManager && (
            <Link href="/dashboard/sales/campaigns" style={{
              background: 'var(--bg)', color: '#0a0a0a', border: '1px solid var(--border, #e5e5e5)', textDecoration: 'none',
              fontSize: 13, padding: '7px 14px', borderRadius: 6,
            }}>
              🎯 קמפיינים
            </Link>
          )}
          {isManager && pendingCount > 0 && (
            <Link href="/dashboard/sales/pending" style={{
              background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', textDecoration: 'none',
              fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 6,
            }}>
              📥 {pendingCount} ממתינים לאישורך
            </Link>
          )}
          <AddContactForm
            label="+ צור ליד חדש" modalTitle="ליד חדש"
            workspaces={workspaces || []} defaultWorkspaceId={workspaceId || ''} existingTags={existingTags} tagGroups={tagGroups}
          />
        </div>
      </div>

      {advancedInquiries.length > 0 && (
        <AdvancedInquiriesBanner
          advancedInquiries={advancedInquiries.map((a) => ({ ...a, stageLabel: pipeline.labels[a.stage] || a.stage }))}
          stagesSummary={advancedInquiries.map((a) => pipeline.labels[a.stage] || a.stage).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')}
        />
      )}

      {leads.length === 0 && campaignLeadGroups.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין לידים פתוחים כרגע</div>
      ) : (
        <LeadsBoard
          leads={leads} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName}
          stages={pipeline.order} sideStages={pipeline.sideStages} stageLabels={pipeline.labels} stageColors={pipeline.colors}
          leadStages={pipeline.leadStages} wonStage={pipeline.wonStage} leadTabByStage={pipeline.leadTabByStage}
          sendConnections={sendConnections || []} whatsappTemplates={whatsappTemplates || []}
          emailTemplates={emailTemplates || []}
          extraFields={isManager ? extraFields : extraFields.filter((f) => f.visibleToAgents !== false)}
          closeReasons={closeReasons}
          campaignLeadGroups={campaignLeadGroups}
        />
      )}
    </div>
  );
}
