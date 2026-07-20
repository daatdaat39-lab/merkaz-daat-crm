import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';

function formatDuration(ms) {
  if (!ms || ms < 60000) return 'פחות מדקה';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} דק'`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours} שע' ו-${rem} דק'` : `${hours} שעות`;
}

function formatLastSeen(iso) {
  if (!iso) return 'מעולם לא';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5 * 60000) return 'מחובר כעת';
  if (ms < 3600000) return `לפני ${Math.round(ms / 60000)} דק'`;
  if (ms < 86400000) return `לפני ${Math.round(ms / 3600000)} שעות`;
  return new Date(iso).toLocaleDateString('he-IL');
}

// דוח פעילות נציגים למנהלים - כמה זמן כל אחד היה פעיל במערכת (מבוסס
// "נראה לאחרונה" בכל טעינת עמוד, לא session מלא) וכמה הוא ביצע בפועל
// (משימות שהושלמו, מיילים ו-WhatsApp שנשלחו).
export default async function ActivityReportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ownerRows } = await supabase
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).eq('role', 'owner').limit(1);
  const isOwnerAnywhere = (ownerRows?.length || 0) > 0;

  const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
  const { data: myMembership } = await supabase
    .from('workspace_members').select('role').eq('workspace_id', profile?.current_workspace_id).eq('user_id', user.id).single();
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  if (!isOwnerAnywhere && !canManage) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg, #fffbeb)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner או admin יכולים לראות דוח פעילות.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  let userIds = [];
  if (isOwnerAnywhere) {
    const { data: allProfiles } = await admin.from('profiles').select('id');
    userIds = (allProfiles || []).map((p) => p.id);
  } else {
    const { data: memberRows } = await admin.from('workspace_members').select('user_id').eq('workspace_id', profile.current_workspace_id);
    userIds = (memberRows || []).map((m) => m.user_id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [{ data: profiles }, { data: usersList }, { data: todayActivity }, { data: weekActivity }, { data: tasksDone }, { data: emailsSent }, { data: whatsappSent }] = await Promise.all([
    admin.from('profiles').select('id, name, last_seen_at').in('id', userIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('user_activity_days').select('user_id, first_seen_at, last_seen_at').eq('day', today).in('user_id', userIds),
    admin.from('user_activity_days').select('user_id, first_seen_at, last_seen_at').gte('day', weekAgo).in('user_id', userIds),
    admin.from('tasks').select('assigned_to').eq('done', true).in('assigned_to', userIds),
    admin.from('sent_emails').select('sent_by').in('sent_by', userIds),
    admin.from('sent_whatsapp').select('sent_by').eq('direction', 'out').in('sent_by', userIds),
  ]);

  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));
  const countBy = (rows, key) => (rows || []).reduce((acc, r) => { if (r[key]) acc[r[key]] = (acc[r[key]] || 0) + 1; return acc; }, {});
  const tasksDoneCount = countBy(tasksDone, 'assigned_to');
  const emailsSentCount = countBy(emailsSent, 'sent_by');
  const whatsappSentCount = countBy(whatsappSent, 'sent_by');

  const todayById = Object.fromEntries((todayActivity || []).map((r) => [r.user_id, r]));
  const weekMsById = {};
  for (const r of weekActivity || []) {
    const ms = new Date(r.last_seen_at).getTime() - new Date(r.first_seen_at).getTime();
    weekMsById[r.user_id] = (weekMsById[r.user_id] || 0) + Math.max(ms, 0);
  }

  const rows = (profiles || [])
    .map((p) => {
      const t = todayById[p.id];
      const todayMs = t ? new Date(t.last_seen_at).getTime() - new Date(t.first_seen_at).getTime() : 0;
      return {
        id: p.id,
        name: p.name || 'משתמש',
        email: emailById[p.id] || '',
        lastSeen: p.last_seen_at,
        activeToday: formatDuration(todayMs),
        activeWeek: formatDuration(weekMsById[p.id] || 0),
        tasksDone: tasksDoneCount[p.id] || 0,
        emailsSent: emailsSentCount[p.id] || 0,
        whatsappSent: whatsappSentCount[p.id] || 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 6px', fontSize: 20 }}>דוח פעילות נציגים</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        זמן פעילות מבוסס על מרווח בין הכניסה הראשונה לאחרונה למערכת בכל יום — קירוב, לא מדידה מדויקת של זמן עבודה בפועל.
      </p>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {['נציג', 'נראה לאחרונה', 'פעיל היום', 'פעיל השבוע', 'משימות שהושלמו', 'מיילים שנשלחו', 'הודעות WhatsApp'].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.email}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>{formatLastSeen(r.lastSeen)}</td>
                <td style={{ padding: '10px 14px' }}>{r.activeToday}</td>
                <td style={{ padding: '10px 14px' }}>{r.activeWeek}</td>
                <td style={{ padding: '10px 14px' }}>{r.tasksDone}</td>
                <td style={{ padding: '10px 14px' }}>{r.emailsSent}</td>
                <td style={{ padding: '10px 14px' }}>{r.whatsappSent}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>אין נתונים</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
