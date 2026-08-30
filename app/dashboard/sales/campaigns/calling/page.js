import Link from 'next/link';
import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';

// נקודת-כניסה לתור-שיחות עבור כל חבר-מחלקה (לא רק מנהל) - הכרחי כי
// sales/campaigns (רשימה) ו-[id] (כרטיס) חסומים לגמרי למנהלים בלבד
// (isManagerOfWorkspace), ואין דרך אחרת לנציג רגיל להגיע לקמפיין כלשהו.
export default async function CallingCampaignsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
  const workspaceId = profile?.current_workspace_id;

  let campaigns = [];
  if (workspaceId) {
    // תפקיד "טלפן" הנעול רואה רק קמפיינים שמנהל פתח במפורש לטלפניה
    // (ר' migration 0096) - מנהל/נציג רגיל, שמשתמשים באותו מסך לבדיקות,
    // ממשיכים לראות הכל בלי קשר לשער הזה.
    const { data: membership } = await supabase
      .from('workspace_members').select('role').eq('user_id', user.id).eq('workspace_id', workspaceId).maybeSingle();
    const isLockedTelemarketer = membership?.role === 'telemarketer';

    let query = supabase
      .from('campaigns')
      .select('id, name, channel')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .neq('kind', 'dedication');
    if (isLockedTelemarketer) query = query.eq('open_for_telemarketing', true);
    const { data } = await query.order('name');
    campaigns = data || [];
  }

  const counts = await Promise.all(campaigns.map(async (c) => {
    const { data } = await supabase.rpc('count_callable_campaign_contacts_by_category', { p_campaign_id: c.id, p_caller: user.id });
    return (data || []).reduce((s, r) => s + Number(r.callable_count || 0), 0);
  }));

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 4px', fontSize: 20 }}>📱 תור שיחות</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        בחרו קמפיין כדי להתחיל להתקשר - המערכת תמסור לכם איש קשר אחד בכל פעם.
      </p>

      {campaigns.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          אין כרגע קמפיינים פעילים במחלקה שלכם.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {campaigns.map((c, i) => (
          <Link key={c.id} href={`/dashboard/sales/campaigns/${c.id}/calling`} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit',
            background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
              {c.channel && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.channel}</div>}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: counts[i] > 0 ? 'var(--accent, #2f6f4f)' : 'var(--text-muted)' }}>
              {counts[i]} ממתינים לשיחה
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
