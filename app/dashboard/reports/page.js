import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPipeline } from '../lib/pipelines';
import { isManagerOfWorkspace } from '../lib/contactGuards';
import { fetchAllRows } from '../lib/fetchAllRows';
import { startOfIsraelDay, startOfIsraelMonth, israelYmd } from '../lib/time';
import { kpiTile, card, sectionLabel } from '../components/designTokens';

export const dynamic = 'force-dynamic';

// מסך דוחות למנהלים (מחליף את המסך הישן שהציג "פילוח לפי תחום" על שדה שכבר לא
// בשימוש ומספרים חתוכים ל-1,000 שורות). כל מספר כאן מחושב על כל השורות
// (עם דפדוף או ספירה ב-DB, לא על 1,000 הראשונות), בשעון ישראל, וסופר רק
// "תהליכים אמיתיים" - opened_process=true ו-approval_status='approved' - כמו
// לוח הלידים. ההגדרות מפורטות בתחתית המסך כדי שאפשר יהיה לדעת מה בדיוק נספר.
const RANGES = [
  { key: '7', label: '7 ימים', days: 7 },
  { key: '30', label: '30 יום', days: 30 },
  { key: '90', label: '90 יום', days: 90 },
  { key: 'month', label: 'החודש', days: null },
];

const num = (n) => Number(n || 0).toLocaleString('he-IL');
const money = (n) => `₪${Math.round(Number(n || 0)).toLocaleString('he-IL')}`;
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

export default async function ReportsPage({ searchParams }) {
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
  if (!workspaceId || !(await isManagerOfWorkspace(supabase, user.id, workspaceId))) redirect('/dashboard');

  const range = RANGES.find((r) => r.key === searchParams?.range) || RANGES[1];
  const now = new Date();
  const fromIso = range.days ? startOfIsraelDay(now, -(range.days - 1)) : startOfIsraelMonth(now);
  const dayAgoIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const todayYmd = israelYmd(now);

  const pipeline = await getPipeline(supabase, workspaceName);
  const stageKeys = [...pipeline.order, ...pipeline.sideStages];
  const base = () => supabase.from('contact_departments').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('opened_process', true).eq('approval_status', 'approved');

  const [cohort, purchases, stageCountResults, untouched, openCases, casesCreated, casesClosed, overdueCases, openTasks, overdueTasks] = await Promise.all([
    fetchAllRows(() => supabase
      .from('contact_departments')
      .select('id, stage, agent_id, contacts:contact_id (source)')
      .eq('workspace_id', workspaceId).eq('opened_process', true).eq('approval_status', 'approved')
      .gte('created_at', fromIso)),
    fetchAllRows(() => supabase
      .from('course_purchases')
      .select('price, status, courses:course_id (name)')
      .eq('workspace_id', workspaceId).gte('created_at', fromIso)),
    Promise.all(stageKeys.map((s) => base().eq('stage', s))),
    pipeline.leadStages.length
      ? base().in('stage', pipeline.leadStages).lt('last_activity_at', dayAgoIso)
      : Promise.resolve({ count: 0 }),
    supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).neq('status', 'closed'),
    supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', fromIso),
    supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'closed').gte('closed_at', fromIso),
    supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).neq('status', 'closed').lt('sla_due_at', now.toISOString()),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('done', false),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('done', false).lt('due_date', todayYmd),
  ]);

  // ---- חישובים על הקוהורטה (לידים שנפתחו בתקופה) ----
  const total = cohort.length;
  const won = cohort.filter((r) => r.stage === pipeline.wonStage).length;
  const bySource = new Map();
  const byAgent = new Map();
  for (const r of cohort) {
    const src = (r.contacts?.source || '').trim() || 'לא צוין';
    const s = bySource.get(src) || { total: 0, won: 0 };
    s.total++; if (r.stage === pipeline.wonStage) s.won++;
    bySource.set(src, s);
    const ag = r.agent_id || 'none';
    const a = byAgent.get(ag) || { total: 0, won: 0 };
    a.total++; if (r.stage === pipeline.wonStage) a.won++;
    byAgent.set(ag, a);
  }
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  const agentIds = [...byAgent.keys()].filter((k) => k !== 'none');
  let agentNames = {};
  if (agentIds.length) {
    const { data: nameRows } = await supabase.from('profiles').select('id, name').in('id', agentIds);
    agentNames = Object.fromEntries((nameRows || []).map((p) => [p.id, p.name]));
  }
  const agentRows = [...byAgent.entries()].sort((a, b) => b[1].total - a[1].total);

  const stageNow = stageKeys.map((s, i) => ({ key: s, label: pipeline.labels[s] || s, count: stageCountResults[i]?.count || 0 }));
  const maxStage = Math.max(1, ...stageNow.map((s) => s.count));

  // ---- הרשמות והכנסות (course_purchases בתקופה, בלי מבוטלות) ----
  const activePurchases = purchases.filter((p) => p.status !== 'cancelled');
  const byCourse = new Map();
  for (const p of activePurchases) {
    const name = p.courses?.name || 'לא צוין קורס';
    const c = byCourse.get(name) || { count: 0, revenue: 0, unpriced: 0 };
    c.count++;
    if (p.price == null) c.unpriced++; else c.revenue += Number(p.price);
    byCourse.set(name, c);
  }
  const revenueTotal = activePurchases.reduce((sum, p) => sum + (p.price == null ? 0 : Number(p.price)), 0);
  const unpricedTotal = activePurchases.filter((p) => p.price == null).length;

  const th = { textAlign: 'right', padding: '8px 14px', fontSize: 11, color: 'var(--k-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--k-border)' };
  const td = { padding: '8px 14px', fontSize: 13, borderBottom: '1px solid var(--k-border)' };

  return (
    <div className="page-pad" style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', background: 'var(--k-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--k-font-display)', margin: 0, fontSize: 30, color: 'var(--k-text)' }}>דוחות</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--k-text-muted)', fontSize: 12.5 }}>
            {workspaceName} · לידים שנפתחו מ-{new Date(fromIso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })} ועד היום
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/dashboard/reports?range=${r.key}`}
              style={{
                padding: '7px 14px', borderRadius: 999, fontSize: 12.5, textDecoration: 'none',
                border: '1px solid var(--k-border)',
                background: r.key === range.key ? 'var(--k-text)' : 'var(--k-surface)',
                color: r.key === range.key ? 'var(--k-bg)' : 'var(--k-text)',
              }}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid-kpi" style={{ marginBottom: 14 }}>
        <div style={kpiTile()}>
          <div style={sectionLabel}>לידים שנפתחו</div>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 30, marginTop: 8 }}>{num(total)}</div>
        </div>
        <div style={kpiTile()}>
          <div style={sectionLabel}>מתוכם נרשמו</div>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 30, marginTop: 8 }}>{num(won)}</div>
        </div>
        <div style={kpiTile()}>
          <div style={sectionLabel}>אחוז המרה (קוהורטה)</div>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 30, marginTop: 8 }}>{pct(won, total)}</div>
        </div>
        <div style={kpiTile()}>
          <div style={sectionLabel}>לידים ללא טיפול מעל 24 שעות</div>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 30, marginTop: 8, color: (untouched.count || 0) > 0 ? 'var(--k-danger-text, #a3392f)' : 'inherit' }}>{num(untouched.count)}</div>
        </div>
      </div>

      <div className="grid-panels" style={{ marginBottom: 14 }}>
        <div style={card({ overflow: 'hidden' })}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16 }}>
            משפך נוכחי - כל התהליכים הפעילים
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stageNow.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 110, fontSize: 12.5, color: 'var(--k-text-muted)' }}>{s.label}</div>
                <div style={{ flex: 1, height: 8, background: 'var(--k-pill-bg)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((s.count / maxStage) * 100)}%`, height: '100%', background: 'var(--k-accent, #6161FF)' }} />
                </div>
                <div style={{ width: 44, textAlign: 'left', fontSize: 12, fontWeight: 600 }}>{num(s.count)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={card({ overflow: 'hidden' })}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16 }}>
            לפי מקור הליד
          </div>
          {sourceRows.length === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: 'var(--k-text-muted)' }}>אין לידים בתקופה.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>מקור</th><th style={th}>לידים</th><th style={th}>נרשמו</th><th style={th}>המרה</th></tr></thead>
              <tbody>
                {sourceRows.map(([src, v]) => (
                  <tr key={src}><td style={td}>{src}</td><td style={td}>{num(v.total)}</td><td style={td}>{num(v.won)}</td><td style={td}>{pct(v.won, v.total)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid-panels" style={{ marginBottom: 14 }}>
        <div style={card({ overflow: 'hidden' })}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16 }}>
            לפי נציג מטפל
          </div>
          {agentRows.length === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: 'var(--k-text-muted)' }}>אין לידים בתקופה.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>נציג</th><th style={th}>לידים</th><th style={th}>נרשמו</th><th style={th}>המרה</th></tr></thead>
              <tbody>
                {agentRows.map(([id, v]) => (
                  <tr key={id}>
                    <td style={td}>{id === 'none' ? 'ללא נציג' : (agentNames[id] || 'משתמש')}</td>
                    <td style={td}>{num(v.total)}</td><td style={td}>{num(v.won)}</td><td style={td}>{pct(v.won, v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={card({ overflow: 'hidden' })}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--k-border)', fontFamily: 'var(--k-font-display)', fontSize: 16 }}>
            הרשמות והכנסות בתקופה
          </div>
          {byCourse.size === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: 'var(--k-text-muted)' }}>אין הרשמות בתקופה.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>קורס</th><th style={th}>הרשמות</th><th style={th}>הכנסה</th></tr></thead>
              <tbody>
                {[...byCourse.entries()].sort((a, b) => b[1].count - a[1].count).map(([name, v]) => (
                  <tr key={name}>
                    <td style={td}>{name}</td><td style={td}>{num(v.count)}</td>
                    <td style={td}>{money(v.revenue)}{v.unpriced > 0 && <span style={{ color: 'var(--k-text-muted)', fontSize: 11 }}> ({v.unpriced} ללא מחיר)</span>}</td>
                  </tr>
                ))}
                <tr><td style={{ ...td, fontWeight: 700 }}>סה״כ</td><td style={{ ...td, fontWeight: 700 }}>{num(activePurchases.length)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money(revenueTotal)}{unpricedTotal > 0 && <span style={{ color: 'var(--k-text-muted)', fontSize: 11, fontWeight: 400 }}> ({unpricedTotal} ללא מחיר)</span>}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid-kpi" style={{ marginBottom: 20 }}>
        <div style={kpiTile()}><div style={sectionLabel}>קריאות שירות פתוחות</div><div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, marginTop: 8 }}>{num(openCases.count)}</div></div>
        <div style={kpiTile()}><div style={sectionLabel}>חרגו מה-SLA</div><div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, marginTop: 8, color: (overdueCases.count || 0) > 0 ? 'var(--k-danger-text, #a3392f)' : 'inherit' }}>{num(overdueCases.count)}</div></div>
        <div style={kpiTile()}><div style={sectionLabel}>נפתחו / נסגרו בתקופה</div><div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, marginTop: 8 }}>{num(casesCreated.count)} / {num(casesClosed.count)}</div></div>
        <div style={kpiTile()}><div style={sectionLabel}>משימות פתוחות</div><div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, marginTop: 8 }}>{num(openTasks.count)}</div></div>
        <div style={kpiTile()}><div style={sectionLabel}>משימות באיחור</div><div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, marginTop: 8, color: (overdueTasks.count || 0) > 0 ? 'var(--k-danger-text, #a3392f)' : 'inherit' }}>{num(overdueTasks.count)}</div></div>
      </div>

      <details style={{ ...card(), padding: '14px 18px', fontSize: 12.5, color: 'var(--k-text-muted)', lineHeight: 1.8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--k-text)' }}>מה בדיוק נספר, ומה עדיין לא נמדד</summary>
        <ul style={{ margin: '10px 0 0', paddingInlineStart: 18 }}>
          <li><b>ליד שנפתח</b> - שיוך למחלקה שנפתח בו תהליך (לא ייבוא היסטורי) ואושר, שנוצר בתקופה שנבחרה. הזמנים לפי שעון ישראל.</li>
          <li><b>נרשמו / אחוז המרה</b> - מתוך הלידים שנפתחו בתקופה, כמה נמצאים היום בשלב ההצלחה ({pipeline.labels[pipeline.wonStage] || '—'}). זו מדידת קוהורטה: לידים חדשים שעוד בתהליך מורידים את האחוז זמנית.</li>
          <li><b>ללא טיפול מעל 24 שעות</b> - תהליכים פעילים בשלב ליד (לא כל תקופה) שהפעילות האחרונה בהם לפני יותר מ-24 שעות.</li>
          <li><b>הרשמות והכנסות</b> - רכישות קורס שנוצרו בתקופה, בלי מבוטלות. הכנסה = המחיר שנרשם בהרשמה; הרשמה בלי מחיר נספרת אבל לא מוסיפה לסכום.</li>
          <li><b>עדיין לא נמדד:</b> זמן תגובה ראשונה לליד, מועד המעבר בין שלבים (כך שאין עדיין &quot;כמה נרשמו השבוע&quot; לפי תאריך ההרשמה עצמו), תוצאות פגישות ואיכות שיחות. הנתונים האלה לא נשמרו עד היום - אפשר להתחיל לאסוף אותם.</li>
        </ul>
      </details>
    </div>
  );
}
