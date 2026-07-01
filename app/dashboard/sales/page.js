import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { STAGE_LABELS, STAGE_ORDER } from '../components/ui';

export default async function SalesDashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let contacts = [];
  if (workspaceId) {
    const { data } = await supabase.from('contacts').select('stage, source, created_at').eq('workspace_id', workspaceId);
    contacts = data || [];
  }

  const total = contacts.length;
  const closedWon = contacts.filter((c) => c.stage === 'registered').length;
  const closedLost = contacts.filter((c) => c.stage === 'closed').length;
  const inProgress = total - closedWon - closedLost;
  const conversionRate = total ? Math.round((closedWon / total) * 100) : 0;

  const sourceCounts = {};
  contacts.forEach((c) => {
    const s = c.source || 'לא ידוע';
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  });

  const stageCounts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = contacts.filter((c) => c.stage === s).length;
    return acc;
  }, {});

  const cards = [
    { label: 'סה"כ לידים', value: total },
    { label: 'בתהליך', value: inProgress },
    { label: 'נרשמו בהצלחה', value: closedWon },
    { label: 'אחוז המרה', value: `${conversionRate}%` },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>דשבורד מכירות</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {cards.map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>פייפליין לפי שלב</div>
          {STAGE_ORDER.map((s) => {
            const max = Math.max(1, ...Object.values(stageCounts));
            const pct = Math.round((stageCounts[s] / max) * 100);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 90, fontSize: 12, color: '#6b6b6b' }}>{STAGE_LABELS[s]}</div>
                <div style={{ flex: 1, background: '#f2f2f2', borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: '#2563eb', height: '100%', borderRadius: 4 }} />
                </div>
                <div style={{ width: 24, fontSize: 12, fontWeight: 600 }}>{stageCounts[s]}</div>
              </div>
            );
          })}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>לידים לפי מקור</div>
          {Object.entries(sourceCounts).length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין נתונים</div>}
          {Object.entries(sourceCounts).map(([src, count]) => {
            const max = Math.max(1, ...Object.values(sourceCounts));
            const pct = Math.round((count / max) * 100);
            return (
              <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 90, fontSize: 12, color: '#6b6b6b' }}>{src}</div>
                <div style={{ flex: 1, background: '#f2f2f2', borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: '#16a34a', height: '100%', borderRadius: 4 }} />
                </div>
                <div style={{ width: 24, fontSize: 12, fontWeight: 600 }}>{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
