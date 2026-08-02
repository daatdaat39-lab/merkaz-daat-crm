import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { STAGE_LABELS } from './components/ui';
import { getPipeline } from './components/pipelines';
import { randomPraise } from './components/celebrate';
import DedicationsWidget from './DedicationsWidget';

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'לילה טוב';
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  if (hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default async function DashboardHome() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, name, workspaces:current_workspace_id (name)')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;
  const pipeline = getPipeline(profile?.workspaces?.name);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const [{ count: outreachToday }, { count: outreachYesterday }] = await Promise.all([
    supabase.from('sent_whatsapp').select('id', { count: 'exact', head: true }).eq('sent_by', user.id).eq('direction', 'out').gte('sent_at', todayStart),
    supabase.from('sent_whatsapp').select('id', { count: 'exact', head: true }).eq('sent_by', user.id).eq('direction', 'out').gte('sent_at', yesterdayStart).lt('sent_at', todayStart),
  ]);
  const [{ count: emailsToday }, { count: emailsYesterday }] = await Promise.all([
    supabase.from('sent_emails').select('id', { count: 'exact', head: true }).eq('sent_by', user.id).gte('sent_at', todayStart),
    supabase.from('sent_emails').select('id', { count: 'exact', head: true }).eq('sent_by', user.id).gte('sent_at', yesterdayStart).lt('sent_at', todayStart),
  ]);
  const totalToday = (outreachToday || 0) + (emailsToday || 0);
  const totalYesterday = (outreachYesterday || 0) + (emailsYesterday || 0);

  let contacts = [];
  let workspaceContacts = [];
  let meetings = [];
  let openTasks = [];
  let upcomingCharges = [];
  const isDonationsWorkspace = profile?.workspaces?.name === 'תרומות';

  // תאריכי לוח שנה/הקדשות בטווח אתמול..שבוע קדימה - לא מסונן לפי מחלקה,
  // כי ההקדשה שייכת לאיש הקשר עצמו ולא לשיוך מחלקתי מסוים
  const dayMs = 86400000;
  const isoDay = (offset) => new Date(Date.now() + offset * dayMs).toISOString().slice(0, 10);
  const { data: dedicationRows } = await supabase
    .from('calendar_dedications')
    .select('id, contact_id, dedication_date, dedication_text, note, contacts:contact_id (first, last)')
    .gte('dedication_date', isoDay(-1))
    .lte('dedication_date', isoDay(7))
    .order('dedication_date', { ascending: true });

  const yesterdayStr = isoDay(-1);
  const todayDateStr = isoDay(0);
  const tomorrowStr = isoDay(1);
  const dedicationGroups = { אתמול: [], היום: [], מחר: [], 'השבוע הקרוב': [] };
  for (const row of dedicationRows || []) {
    const item = { ...row, contactName: `${row.contacts?.first || ''} ${row.contacts?.last || ''}`.trim() };
    if (row.dedication_date === yesterdayStr) dedicationGroups['אתמול'].push(item);
    else if (row.dedication_date === todayDateStr) dedicationGroups['היום'].push(item);
    else if (row.dedication_date === tomorrowStr) dedicationGroups['מחר'].push(item);
    else dedicationGroups['השבוע הקרוב'].push(item);
  }

  if (workspaceId) {
    const [{ data: c }, { data: wc }, { data: m }, { data: t }] = await Promise.all([
      supabase.from('contacts').select('id, created_at'),
      supabase.from('contact_departments').select('stage').eq('workspace_id', workspaceId),
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
    workspaceContacts = wc || [];
    meetings = m || [];
    openTasks = t || [];

    // חיובי הוראת קבע קרובים (7 ימים) - רק למחלקת תרומות. extra_fields
    // הוא jsonb בלי אינדקס תאריך, אז מסננים/ממיינים בקוד אחרי שליפה
    // מצומצמת (רק שיוכים עם הוראת קבע במחלקה הזו).
    if (isDonationsWorkspace) {
      const { data: standingOrders } = await supabase
        .from('contact_departments')
        .select('id, contact_id, extra_fields, contacts(first,last)')
        .eq('workspace_id', workspaceId)
        .eq('extra_fields->>donation_type', 'הוראת קבע');
      const in7DaysStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      // כולל גם חיובים שכבר עברו (בלי עדכון) - עוזר לזהות פיגור, לא רק להתקרב
      upcomingCharges = (standingOrders || [])
        .map((row) => ({ ...row, nextChargeDate: row.extra_fields?.standing_order_next_charge_date }))
        .filter((row) => row.nextChargeDate && row.nextChargeDate <= in7DaysStr)
        .sort((a, b) => (a.nextChargeDate < b.nextChargeDate ? -1 : 1));
    }
  }

  const stageCounts = pipeline.order.reduce((acc, s) => {
    acc[s] = workspaceContacts.filter((c) => c.stage === s).length;
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
          {timeGreeting()}, {profile?.name || ''} 👋
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b6b6b', fontSize: 12.5 }}>
          {randomPraise()} · סקירה כללית של ה-workspace הפעיל
        </p>
        {totalYesterday > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: totalToday >= totalYesterday ? '#2f7d4f' : '#6b6b6b' }}>
            {totalToday >= totalYesterday
              ? `אתמול שלחת ${totalYesterday} פניות, היום כבר ${totalToday} — ${totalToday > totalYesterday ? 'קדימה, שוברים שיא! 🔥' : 'ממשיכים באותו קצב 👍'}`
              : `אתמול שלחת ${totalYesterday} פניות, היום ${totalToday} — יש עוד זמן ביום, בוא נתפוס תאוצה 💪`}
          </p>
        )}
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
            פילוח לפי שלב בתהליך
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pipeline.order.map((s) => {
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
            {meetings.map((m) => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isToday = m.meeting_date === todayStr;
              const minutesUntil = (new Date(`${m.meeting_date}T${m.meeting_time || '00:00'}`).getTime() - Date.now()) / 60000;
              const soon = isToday && minutesUntil > 0 && minutesUntil < 60;
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #f2f2f2', fontSize: 13,
                  background: soon ? '#fff7ed' : 'transparent',
                }}>
                  <span style={{ fontSize: 14 }}>{soon ? '🔔' : isToday ? '📅' : '🗓️'}</span>
                  <b>{m.contacts?.first} {m.contacts?.last}</b>
                  <span style={{ color: soon ? '#c2760f' : '#9b9b9b', fontWeight: soon ? 600 : 400 }}>
                    {isToday ? `היום · ${m.meeting_time?.slice(0, 5)}` : `${new Date(m.meeting_date).toLocaleDateString('he-IL')} · ${m.meeting_time?.slice(0, 5)}`}
                    {soon && ` (בעוד ${Math.round(minutesUntil)} דק')`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DedicationsWidget groups={dedicationGroups} />

      {isDonationsWorkspace && (
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600 }}>
            🔔 חיובי הוראת קבע קרובים (7 ימים)
          </div>
          <div>
            {upcomingCharges.length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 13, color: '#9b9b9b' }}>אין חיובי הוראת קבע קרובים</div>
            )}
            {upcomingCharges.map((row) => {
              const days = Math.round((new Date(row.nextChargeDate).getTime() - Date.now()) / 86400000);
              const overdue = days < 0;
              return (
                <Link
                  key={row.id}
                  href={`/dashboard/contacts/${row.contact_id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #f2f2f2',
                    fontSize: 13, textDecoration: 'none', color: 'inherit',
                    background: overdue ? '#fef2f2' : days <= 1 ? '#fff7ed' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{overdue ? '⚠' : days <= 1 ? '🔔' : '💳'}</span>
                  <b>{row.contacts?.first} {row.contacts?.last}</b>
                  <span style={{ color: overdue ? '#b23b2f' : days <= 1 ? '#c2760f' : '#9b9b9b', fontWeight: overdue || days <= 1 ? 600 : 400 }}>
                    {new Date(row.nextChargeDate).toLocaleDateString('he-IL')}
                    {overdue ? ` (עבר לפני ${Math.abs(days)} ימים)` : days === 0 ? ' (היום)' : ` (בעוד ${days} ימים)`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
