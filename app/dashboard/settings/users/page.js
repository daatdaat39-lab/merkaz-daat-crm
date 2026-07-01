import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import InviteForm from './InviteForm';
import MemberRow from './MemberRow';

export default async function UsersManagementPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  const { data: myMembership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  let members = [];
  try {
    const admin = createAdminClient();
    const { data: memberRows } = await admin
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId);

    const userIds = (memberRows || []).map((m) => m.user_id);
    let profilesById = {};
    if (userIds.length > 0) {
      const { data: profileRows } = await admin
        .from('profiles')
        .select('id, name, role')
        .in('id', userIds);
      profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
    }

    members = (memberRows || []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      profiles: profilesById[m.user_id] || null,
    }));
  } catch {
    members = [];
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>
        ← חזרה להגדרות
      </a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 20px', fontSize: 20 }}>ניהול משתמשים</h1>

      {!canManage && (
        <div style={{
          background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8,
          padding: '12px 16px', fontSize: 12.5, marginBottom: 20, color: '#92400e',
        }}>
          רק owner או admin יכולים להזמין ולנהל משתמשים ב-workspace הזה.
        </div>
      )}

      {canManage && <InviteForm />}

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
          חברי הצוות ({members?.length || 0})
        </div>
        {(members || []).map((m) => (
          canManage ? (
            <MemberRow
              key={m.user_id}
              userId={m.user_id}
              name={m.profiles?.name || 'משתמש'}
              role={m.role}
              isSelf={m.user_id === user.id}
            />
          ) : (
            <div key={m.user_id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 18px', borderBottom: '1px solid #f2f2f2',
            }}>
              <span style={{ fontSize: 13 }}>{m.profiles?.name || 'משתמש'}</span>
              <span style={{
                fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 9px', borderRadius: 10,
              }}>
                {m.role === 'owner' ? 'בעלים' : m.role === 'admin' ? 'מנהל' : 'חבר'}
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
