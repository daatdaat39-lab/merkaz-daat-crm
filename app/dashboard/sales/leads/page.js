import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { DEPT_KEYWORDS, contactMatchesDept } from '../../components/ui';
import { getPipeline } from '../../components/pipelines';
import AddContactForm from '../../contacts/AddContactForm';
import LeadRow from './LeadRow';

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
  const pipeline = getPipeline(workspaceName);

  let leads = [];
  let agents = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('contact_departments')
      .select('id, stage, agent_id, last_activity_at, contacts:contact_id (id, first, last, phone, email, source, dept, tags), lead_inquiries (reason, created_at)')
      .eq('workspace_id', workspaceId)
      .in('stage', pipeline.leadStages)
      .order('last_activity_at', { ascending: false });
    leads = (data || [])
      .filter((row) => row.contacts)
      .map((row) => {
        const inquiries = [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return {
          ...row.contacts,
          departmentRowId: row.id, stage: row.stage, agent_id: row.agent_id, last_activity_at: row.last_activity_at,
          latestReason: inquiries[0]?.reason || null,
          inquiryCount: inquiries.length,
        };
      });

    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id, profiles ( id, name )')
      .eq('workspace_id', workspaceId);
    agents = (members || [])
      .filter((m) => m.profiles)
      .map((m) => ({ id: m.profiles.id, name: m.profiles.name || 'משתמש' }));
  }

  const [{ data: workspaces }, { data: tagRows }] = await Promise.all([
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('contacts').select('tags'),
  ]);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();

  // מחלקים לתת-קטגוריות לפי תגית (לצורך ארגון בלבד - כל חברי ה-workspace רואים הכל)
  const departments = Object.keys(DEPT_KEYWORDS);
  const categorized = departments
    .map((dept) => ({ dept, leads: leads.filter((l) => contactMatchesDept(l, dept)) }))
    .filter((group) => group.leads.length > 0);

  const categorizedIds = new Set(categorized.flatMap((g) => g.leads.map((l) => l.id)));
  const uncategorized = leads.filter((l) => !categorizedIds.has(l.id));

  const overdueCount = leads.filter((l) => l.last_activity_at && (Date.now() - new Date(l.last_activity_at).getTime()) / 3600000 >= 24).length;

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>לידים</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            {leads.length} לידים פתוחים, מחולקים לתת-קטגוריות
            {overdueCount > 0 && (
              <span style={{ color: 'var(--danger, #a3392f)', fontWeight: 600 }}> · ⚠ {overdueCount} לידים ללא טיפול מעל 24 שעות</span>
            )}
          </p>
        </div>
        <AddContactForm
          label="+ צור ליד חדש" modalTitle="ליד חדש"
          workspaces={workspaces || []} defaultWorkspaceId={workspaceId || ''} existingTags={existingTags}
        />
      </div>

      {categorized.map((group) => (
        <LeadGroup key={group.dept} title={group.dept} leads={group.leads} agents={agents} workspaceId={workspaceId} />
      ))}

      {uncategorized.length > 0 && <LeadGroup title="ללא תגית מזוהה" leads={uncategorized} agents={agents} workspaceId={workspaceId} />}

      {leads.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין לידים פתוחים כרגע</div>
      )}
    </div>
  );
}

function LeadGroup({ title, leads, agents, workspaceId }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
        {title} ({leads.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['שם', 'סטטוס', 'טלפון', 'מייל', 'מקור', 'מהות הפנייה', 'טיפול אחרון', 'נציג מטפל'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((c) => <LeadRow key={c.id} contact={c} agents={agents} workspaceId={workspaceId} />)}
        </tbody>
      </table>
    </div>
  );
}
