import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPipeline } from './lib/pipelines';
import { randomPraise } from './components/celebrate';
import QuickAssignSelect from './QuickAssignSelect';
import { isManagerOfWorkspace } from './lib/contactGuards';
import { kpiTile, sectionLabel } from './components/designTokens';

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
  const pipeline = await getPipeline(supabase, profile?.workspaces?.name);

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

  let totalContactsCount = 0;
  let newThisWeekCount = 0;
  let workspaceContacts = [];
  let meetings = [];
  let openTasks = [];
  let upcomingCharges = [];
  let endingSoon = [];
  let creditIssues = [];
  let silentDonors = [];
  let openPledgesTotal = 0;
  let openPledgesCount = 0;
  let pendingLeadsCount = 0;
  let attentionAgents = [];
  let isDonationsManager = false;
  const isDonationsWorkspace = profile?.workspaces?.name === 'תרומות';

  if (workspaceId) {
    const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: totalCount }, { count: newCount }, { data: wc }, { data: m }, { data: t }] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
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
    totalContactsCount = totalCount || 0;
    newThisWeekCount = newCount || 0;
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

      // "דורש טיפול" - למנהל בלבד. שתי קטגוריות שניתן לחשב מהנתונים
      // הקיימים: הוראות קבע שמתקרבות לסיום התשלומים, ולידים שממתינים
      // לאישור. אשראי שנכשל יתווסף כשמערכת קשר תחובר בחיות.
      isDonationsManager = await isManagerOfWorkspace(supabase, user.id, workspaceId);
      if (isDonationsManager) {
        const contactIds = (standingOrders || []).map((r) => r.contact_id);
        const { data: txns } = contactIds.length
          ? await supabase.from('donation_transactions').select('contact_id').in('contact_id', contactIds)
          : { data: [] };
        const paidByContact = {};
        for (const t of txns || []) paidByContact[t.contact_id] = (paidByContact[t.contact_id] || 0) + 1;

        endingSoon = (standingOrders || [])
          .map((row) => {
            const total = Number(row.extra_fields?.standing_order_total_payments) || null;
            const paid = paidByContact[row.contact_id] || 0;
            return { ...row, total, paid, remaining: total ? total - paid : null };
          })
          // "מתקרב לסיום" = נשארו 3 תשלומים או פחות (כולל כאלה שכבר הסתיימו)
          .filter((row) => row.remaining !== null && row.remaining <= 3)
          .sort((a, b) => a.remaining - b.remaining);

        const { count: pc } = await supabase
          .from('contact_departments')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('approval_status', 'pending');
        pendingLeadsCount = pc || 0;

        // צפי הכנסות פתוחות - הבטחות תרומה (שלב "התחייבות לתרומה") שטרם מומשו
        const { data: pledgeRows } = await supabase
          .from('contact_departments')
          .select('extra_fields')
          .eq('workspace_id', workspaceId)
          .eq('stage', 'committed');
        for (const row of pledgeRows || []) {
          const amount = Number(row.extra_fields?.expected_donation_amount) || 0;
          if (amount > 0) { openPledgesTotal += amount; openPledgesCount++; }
        }

        // תקלות חיוב - שלב ייעודי (מוגדר ידנית ע"י נציג, אין עדיין זיהוי
        // אוטומטי של אשראי שנכשל בלי חיבור חי לקשר)
        const { data: creditIssueRows } = await supabase
          .from('contact_departments')
          .select('id, contact_id, agent_id, contacts(first,last)')
          .eq('workspace_id', workspaceId)
          .eq('stage', 'credit_issue');
        creditIssues = creditIssueRows || [];

        // תורמים פעילים ש-90+ יום בלי אינטראקציה כלשהי
        const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
        const { data: silentRows } = await supabase
          .from('contact_departments')
          .select('id, contact_id, agent_id, last_activity_at, contacts(first,last)')
          .eq('workspace_id', workspaceId)
          .eq('stage', 'active_donor')
          .lt('last_activity_at', cutoff90)
          .order('last_activity_at', { ascending: true })
          .limit(20);
        silentDonors = silentRows || [];

        const { data: attMembers } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
        const attMemberIds = (attMembers || []).map((m) => m.user_id);
        const { data: attProfiles } = attMemberIds.length
          ? await supabase.from('profiles').select('id, name').in('id', attMemberIds)
          : { data: [] };
        attentionAgents = (attProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));
      }
    }
  }

  const stageCounts = pipeline.order.reduce((acc, s) => {
    acc[s] = workspaceContacts.filter((c) => c.stage === s).length;
    return acc;
  }, {});

  const statCards = [
    { label: 'סה"כ אנשי קשר', value: totalContactsCount },
    { label: 'חדשים השבוע', value: newThisWeekCount },
    { label: 'משימות פתוחות', value: openTasks.length },
    { label: 'פגישות קרובות', value: meetings.length },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', background: 'var(--k-bg)', minHeight: '100%' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'var(--k-font-display)', margin: 0, fontSize: 30, color: 'var(--k-text)' }}>
          {timeGreeting()}, {profile?.name || ''} 👋
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--k-text-muted)', fontSize: 12.5 }}>
          {randomPraise()} · סקירה כללית של ה-workspace הפעיל
        </p>
        {totalYesterday > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: totalToday >= totalYesterday ? 'var(--k-ok-text)' : 'var(--k-text-muted)' }}>
            {totalToday >= totalYesterday
              ? `אתמול שלחת ${totalYesterday} פניות, היום כבר ${totalToday} — ${totalToday > totalYesterday ? 'קדימה, שוברים שיא! 🔥' : 'ממשיכים באותו קצב 👍'}`
              : `אתמול שלחת ${totalYesterday} פניות, היום ${totalToday} — יש עוד זמן ביום, בוא נתפוס תאוצה 💪`}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {statCards.map((s) => (
          <div key={s.label} style={kpiTile()}>
            <div style={sectionLabel}>{s.label}</div>
            <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 30, lineHeight: 1, marginTop: 8, color: 'var(--k-text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* פילוח לפי שלב */}
        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16, color: 'var(--k-text)' }}>
            פילוח לפי שלב בתהליך
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pipeline.order.map((s) => {
              const max = Math.max(1, ...Object.values(stageCounts));
              const pct = Math.round((stageCounts[s] / max) * 100);
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 90, fontSize: 12, color: 'var(--k-text-muted)', flexShrink: 0 }}>{pipeline.labels[s]}</div>
                  <div style={{ flex: 1, background: 'var(--k-pill-bg)', borderRadius: 100, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, background: 'var(--k-accent)', height: '100%' }} />
                  </div>
                  <div style={{ width: 24, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--k-text)' }}>{stageCounts[s]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* פגישות קרובות */}
        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden' }}>
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--k-border)',
              fontFamily: 'var(--k-font-display)',
              fontSize: 16,
              color: 'var(--k-text)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>פגישות קרובות</span>
            <Link href="/dashboard/calendar" style={{ fontSize: 12, color: 'var(--k-text-muted)', textDecoration: 'none' }}>
              לכל הפגישות ←
            </Link>
          </div>
          <div>
            {meetings.length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--k-text-muted)' }}>אין פגישות קרובות</div>
            )}
            {meetings.map((m) => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isToday = m.meeting_date === todayStr;
              const minutesUntil = (new Date(`${m.meeting_date}T${m.meeting_time || '00:00'}`).getTime() - Date.now()) / 60000;
              const soon = isToday && minutesUntil > 0 && minutesUntil < 60;
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--k-border)', fontSize: 13,
                  background: soon ? 'var(--k-caution-bg)' : 'transparent',
                }}>
                  <span style={{ fontSize: 14 }}>{soon ? '🔔' : isToday ? '📅' : '🗓️'}</span>
                  <b style={{ color: 'var(--k-text)' }}>{m.contacts?.first} {m.contacts?.last}</b>
                  <span style={{ color: soon ? 'var(--k-caution-text)' : 'var(--k-text-muted)', fontWeight: soon ? 600 : 400 }}>
                    {isToday ? `היום · ${m.meeting_time?.slice(0, 5)}` : `${new Date(m.meeting_date).toLocaleDateString('he-IL')} · ${m.meeting_time?.slice(0, 5)}`}
                    {soon && ` (בעוד ${Math.round(minutesUntil)} דק')`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isDonationsManager && (
        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden', marginTop: 12 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16, color: 'var(--k-text)' }}>
            ⚠ דורש טיפול — מנהל מחלקה
          </div>
          <div>
            {pendingLeadsCount > 0 && (
              <Link href="/dashboard/sales/pending" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                borderBottom: '1px solid var(--k-border)', fontSize: 13, textDecoration: 'none', color: 'var(--k-text)', background: 'var(--k-caution-bg)',
              }}>
                <span style={{ fontSize: 14 }}>📥</span>
                <b>{pendingLeadsCount} לידים ממתינים לאישור ושיוך נציג</b>
              </Link>
            )}
            {creditIssues.map((row) => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--k-border)', fontSize: 13, background: 'var(--k-danger-bg)' }}>
                <span style={{ fontSize: 14 }}>⚠</span>
                <Link href={`/dashboard/contacts/${row.contact_id}`} style={{ color: 'var(--k-text)', textDecoration: 'none', fontWeight: 700 }}>{row.contacts?.first} {row.contacts?.last}</Link>
                <span style={{ color: 'var(--k-danger-text)', fontWeight: 600 }}>תקלה בחיוב / אשראי נכשל</span>
                <span style={{ marginInlineStart: 'auto' }}>
                  <QuickAssignSelect departmentRowId={row.id} agents={attentionAgents} currentAgentId={row.agent_id} />
                </span>
              </div>
            ))}
            {endingSoon.map((row) => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--k-border)', fontSize: 13, background: row.remaining <= 0 ? 'var(--k-danger-bg)' : 'transparent' }}>
                <span style={{ fontSize: 14 }}>{row.remaining <= 0 ? '🔴' : '⏳'}</span>
                <Link href={`/dashboard/contacts/${row.contact_id}`} style={{ color: 'var(--k-text)', textDecoration: 'none', fontWeight: 700 }}>{row.contacts?.first} {row.contacts?.last}</Link>
                <span style={{ color: row.remaining <= 0 ? 'var(--k-danger-text)' : 'var(--k-caution-text)', fontWeight: 600 }}>
                  {row.remaining <= 0
                    ? `הוראת הקבע הסתיימה (${row.paid}/${row.total})`
                    : `נותרו ${row.remaining} תשלומים (${row.paid}/${row.total})`}
                </span>
                <span style={{ marginInlineStart: 'auto' }}>
                  <QuickAssignSelect departmentRowId={row.id} agents={attentionAgents} currentAgentId={row.agent_id} />
                </span>
              </div>
            ))}
            {silentDonors.map((row) => {
              const days = Math.floor((Date.now() - new Date(row.last_activity_at).getTime()) / 86400000);
              return (
                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--k-border)', fontSize: 13 }}>
                  <span style={{ fontSize: 14 }}>💤</span>
                  <Link href={`/dashboard/contacts/${row.contact_id}`} style={{ color: 'var(--k-text)', textDecoration: 'none', fontWeight: 700 }}>{row.contacts?.first} {row.contacts?.last}</Link>
                  <span style={{ color: 'var(--k-text-muted)' }}>{days} ימים בלי אינטראקציה</span>
                  <span style={{ marginInlineStart: 'auto' }}>
                    <QuickAssignSelect departmentRowId={row.id} agents={attentionAgents} currentAgentId={row.agent_id} />
                  </span>
                </div>
              );
            })}
            {pendingLeadsCount === 0 && creditIssues.length === 0 && endingSoon.length === 0 && silentDonors.length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--k-text-muted)' }}>אין פריטים שדורשים טיפול</div>
            )}
            <div style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--k-text-muted)', background: 'var(--k-bg)' }}>
              ℹ️ תקלות אשראי מסומנות כרגע ידנית (שלב "תקלה בחיוב" בכרטיס) — זיהוי אוטומטי יתווסף לאחר חיבור מערכת "קשר" בחיות.
            </div>
          </div>
        </div>
      )}

      {isDonationsManager && openPledgesCount > 0 && (
        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden', marginTop: 12, padding: '14px 18px' }}>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 16, color: 'var(--k-text)', marginBottom: 4 }}>💰 צפי הכנסות פתוחות (הבטחות תרומה)</div>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, color: 'var(--k-accent)' }}>₪{openPledgesTotal.toLocaleString('he-IL')}</div>
          <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>{openPledgesCount} הבטחות תרומה שטרם מומשו</div>
        </div>
      )}

      {isDonationsWorkspace && (
        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden', marginTop: 12 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16, color: 'var(--k-text)' }}>
            🔔 חיובי הוראת קבע קרובים (7 ימים)
          </div>
          <div>
            {upcomingCharges.length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--k-text-muted)' }}>אין חיובי הוראת קבע קרובים</div>
            )}
            {upcomingCharges.map((row) => {
              const days = Math.round((new Date(row.nextChargeDate).getTime() - Date.now()) / 86400000);
              const overdue = days < 0;
              return (
                <Link
                  key={row.id}
                  href={`/dashboard/contacts/${row.contact_id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--k-border)',
                    fontSize: 13, textDecoration: 'none', color: 'var(--k-text)',
                    background: overdue ? 'var(--k-danger-bg)' : days <= 1 ? 'var(--k-caution-bg)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{overdue ? '⚠' : days <= 1 ? '🔔' : '💳'}</span>
                  <b>{row.contacts?.first} {row.contacts?.last}</b>
                  <span style={{ color: overdue ? 'var(--k-danger-text)' : days <= 1 ? 'var(--k-caution-text)' : 'var(--k-text-muted)', fontWeight: overdue || days <= 1 ? 600 : 400 }}>
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
