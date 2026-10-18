import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import CasesBoard from './CasesBoard';

// רשימת/לוח קריאות-שירות (שלב 4 ממודול מכירות/שירות) - route-section
// חדש-לגמרי (לא קיים כלל היום), מודל על sales/leads/page.js אבל פשוט
// יותר: בלי pipeline מוגדר-למחלקה, רק status/severity/SLA/נציג-מטפל.
export default async function ServiceCasesPage() {
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

  let cases = [];
  let agents = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('service_cases')
      .select('id, case_number, subject, status, severity, sla_due_at, assigned_to, created_at, course_id, ai_action_summary, ai_action_summary_stale, contacts:contact_id (id, first, last, phone), courses:course_id (name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    cases = (data || []).filter((row) => row.contacts);

    const { data: members } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
    const memberIds = (members || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    agents = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));
  }

  const { data: courses } = await supabase.from('courses').select('id, name').eq('is_active', true).order('sort_order').order('name');

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px', background: 'var(--k-bg)', minHeight: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--k-text-muted)' }}>שירות</div>
        <h1 style={{ fontFamily: 'var(--k-font-display)', margin: '4px 0 0', fontSize: 30, color: 'var(--k-text)' }}>קריאות שירות</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--k-text-muted)', fontSize: 12.5 }}>
          {workspaceName || 'המחלקה שלך'} · {cases.filter((c) => c.status !== 'closed').length} קריאות פתוחות
        </p>
      </div>

      {!workspaceId ? (
        <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>אין מחלקה פעילה</div>
      ) : (
        <CasesBoard
          cases={cases.map((c) => ({
            id: c.id, caseNumber: c.case_number, subject: c.subject, status: c.status, severity: c.severity,
            slaDueAt: c.sla_due_at, assignedTo: c.assigned_to, createdAt: c.created_at,
            contactId: c.contacts.id, contactName: `${c.contacts.first || ''} ${c.contacts.last || ''}`.trim(), contactPhone: c.contacts.phone,
            courseName: c.courses?.name || null, aiActionSummary: c.ai_action_summary || null,
            aiActionSummaryStale: c.ai_action_summary_stale !== false,
          }))}
          agents={agents}
          courses={courses || []}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}
