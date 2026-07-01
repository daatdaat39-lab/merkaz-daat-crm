import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { STAGE_LABELS, STAGE_ORDER } from './components/ui';

export default async function DashboardHome() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, name')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let contacts = [];
  let meetings = [];
  let openTasks = [];

  if (workspaceId) {
    const [{ data: c }, { data: m }, { data: t }] = await Promise.all([
      supabase.from('contacts').select('id, stage, created_at').eq('workspace_id', workspaceId),
      supabase
        .from('meetings')
        .select('id, meeting_date, meeting_time, title, contacts(first,last)')
        .eq('workspace_id', workspaceId)
        .gte('meeting_date', new Date().toISOString().slice(0, 10))
        .order('meeting_date', { ascending: true })
        .limit(5),
      supabase.from('tasks').select('id').eq('workspace_id', workspaceId).eq('done', false),
    ]);
    contacts = c || [];
    meetings = m || [];
    openTasks = t || [];
  }

  const stageCounts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = contacts.filter((c) => c.stage === s).length;
    return acc;
  }, {});

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const newThisWeek = contacts.filter((c) => new Date(c.created_at) >= weekAgo).length;

  const statCards = [
    { label: 'סה"כ אנשי קשר', value: contacts.length },
    { label: 'חדשים השבוע', value: newThisWeek },
    { label: 'משימות פתוחות', value: openTasks.length },
    { label: 'פגישות קרובות', value: meetings.length },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>
          שלום, {profile?.name || ''} 👋
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b6b6b', fontSize: 12.5 }}>סקירה כללית של ה-workspace הפעיל</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {statCards.map((s) => (
          <div
            key={s.label}
            style={{
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: 8,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* פילוח לפי שלב */}
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600 }}>
            פילוח לפי שלב בפייפליין
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STAGE_ORDER.map((s) => {
              const max = Math.max(1, ...Object.values(stageCounts));
              const pct = Math.round((stageCounts[s] / max) * 100);
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 90, fontSize: 12, color: '#6b6b6b', flexShrink: 0 }}>{STAGE_LABELS[s]}</div>
                  <div style={{ flex: 1, background: '#f2f2f2', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, background: '#0a0a0a', height: '100%' }} />
                  </div>
                  <div style={{ width: 24, textAlign: 'left', fontSize: 12, fontWeight: 600 }}>{stageCounts[s]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* פגישות קרובות */}
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e5e5e5',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>פגישות קרובות</span>
            <Link href="/dashboard/calendar" style={{ fontSize: 12, color: '#6b6b6b', textDecoration: 'none' }}>
              לכל הפגישות ←
            </Link>
          </div>
          <div>
            {meetings.length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 13, color: '#9b9b9b' }}>אין פגישות קרובות</div>
            )}
            {meetings.map((m) => (
              <div key={m.id} style={{ padding: '10px 18px', borderBottom: '1px solid #f2f2f2', fontSize: 13 }}>
                <b>{m.contacts?.first} {m.contacts?.last}</b>
                <span style={{ color: '#9b9b9b', marginRight: 8 }}>
                  {new Date(m.meeting_date).toLocaleDateString('he-IL')} · {m.meeting_time?.slice(0, 5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
