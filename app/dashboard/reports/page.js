import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { STAGE_LABELS } from '../components/ui';
import { getPipeline } from '../components/pipelines';

export default async function ReportsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, workspaces:current_workspace_id (name)')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;
  const pipeline = getPipeline(profile?.workspaces?.name);

  let contacts = [];
  let workspaceContacts = [];
  let tasks = [];
  let meetings = [];
  if (workspaceId) {
    const [{ data: c }, { data: wc }, { data: t }, { data: m }] = await Promise.all([
      supabase.from('contacts').select('dept, created_at'),
      supabase.from('contact_departments').select('stage').eq('workspace_id', workspaceId),
      supabase.from('tasks').select('done').eq('workspace_id', workspaceId),
      supabase.from('meetings').select('meeting_date').eq('workspace_id', workspaceId),
    ]);
    contacts = c || [];
    workspaceContacts = wc || [];
    tasks = t || [];
    meetings = m || [];
  }

  const deptCounts = {};
  contacts.forEach((c) => {
    const d = c.dept || 'לא מוגדר';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });

  const doneTasks = tasks.filter((t) => t.done).length;
  const taskCompletionRate = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const pastMeetings = meetings.filter((m) => m.meeting_date < today).length;
  const futureMeetings = meetings.filter((m) => m.meeting_date >= today).length;

  const stageCounts = pipeline.order.reduce((acc, s) => {
    acc[s] = workspaceContacts.filter((c) => c.stage === s).length;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>דוחות</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'סה"כ אנשי קשר', value: contacts.length },
          { label: 'אחוז השלמת משימות', value: `${taskCompletionRate}%` },
          { label: 'פגישות שהתקיימו', value: pastMeetings },
          { label: 'פגישות עתידיות', value: futureMeetings },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>התפלגות לפי תחום</div>
          {Object.entries(deptCounts).length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין נתונים</div>}
          {Object.entries(deptCounts).map(([dept, count]) => {
            const max = Math.max(1, ...Object.values(deptCounts));
            const pct = Math.round((count / max) * 100);
            return (
              <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 90, fontSize: 12, color: '#6b6b6b' }}>{dept}</div>
                <div style={{ flex: 1, background: '#f2f2f2', borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: '#7c3aed', height: '100%', borderRadius: 4 }} />
                </div>
                <div style={{ width: 24, fontSize: 12, fontWeight: 600 }}>{count}</div>
              </div>
            );
          })}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>התפלגות לפי שלב</div>
          {pipeline.order.map((s) => {
            const max = Math.max(1, ...Object.values(stageCounts));
            const pct = Math.round((stageCounts[s] / max) * 100);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 90, fontSize: 12, color: '#6b6b6b' }}>{STAGE_LABELS[s]}</div>
                <div style={{ flex: 1, background: '#f2f2f2', borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: '#0a0a0a', height: '100%', borderRadius: 4 }} />
                </div>
                <div style={{ width: 24, fontSize: 12, fontWeight: 600 }}>{stageCounts[s]}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
