import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import InviteForm from './InviteForm';
import MemberRow from './MemberRow';
import AllUsersTable from './AllUsersTable';

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
  let isOwnerAnywhere = false;
  let allWorkspaces = [];
  let allUsers = [];

  try {
    const admin = createAdminClient();

    // האם המשתמש הוא owner באיזשהו workspace - אם כן, מקבל את מסך הניהול המאוחד לכל המחלקות
    const { data: ownerRows } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .limit(1);
    isOwnerAnywhere = (ownerRows?.length || 0) > 0;

    let emailsById = {};
    const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    (usersList?.users || []).forEach((u) => { emailsById[u.id] = u.email; });

    if (isOwnerAnywhere) {
      const { data: workspaces } = await admin
        .from('workspaces')
        .select('id, name')
        .order('created_at', { ascending: true });
      allWorkspaces = workspaces || [];

      const { data: profiles } = await admin.from('profiles').select('id, name');
      const { data: memberships } = await admin.from('workspace_members').select('workspace_id, user_id, role');

      const membershipMap = {};
      (memberships || []).forEach((m) => {
        membershipMap[m.user_id] = membershipMap[m.user_id] || {};
        membershipMap[m.user_id][m.workspace_id] = m.role;
      });

      allUsers = (profiles || [])
        .filter((p) => emailsById[p.id])
        .map((p) => ({
          id: p.id,
          name: p.name || 'משתמש',
          email: emailsById[p.id] || '',
          memberships: membershipMap[p.id] || {},
        }));
    } else if (canManage) {
      const { data: memberRows } = await admin
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId);

      const userIds = (memberRows || []).map((m) => m.user_id);
      let profilesById = {};
      if (userIds.length > 0) {
        const { data: profileRows } = await admin
          .from('profiles')
          .select('id, name')
          .in('id', userIds);
        profilesById = Object.fromEntries((profileRows || []).map((p) => [p.id, p]));
      }

      // כל החברויות של המשתמשים האלה בכל ה-workspaces (לא רק הנוכחי) - לתצוגת "כל המחלקות שלו"
      let allMembershipsByUser = {};
      if (userIds.length > 0) {
        const { data: allMemberships } = await admin
          .from('workspace_members')
          .select('user_id, role, workspaces (name)')
          .in('user_id', userIds);
        (allMemberships || []).forEach((m) => {
          if (!m.workspaces) return;
          allMembershipsByUser[m.user_id] = allMembershipsByUser[m.user_id] || [];
          allMembershipsByUser[m.user_id].push({ workspaceName: m.workspaces.name, role: m.role });
        });
      }

      members = (memberRows || []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        profiles: profilesById[m.user_id] || null,
        email: emailsById[m.user_id] || '',
        allMemberships: allMembershipsByUser[m.user_id] || [],
      }));
    }
  } catch {
    members = [];
  }

  return (
    <div style={{ maxWidth: isOwnerAnywhere ? 1000 : 700, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>
        ← חזרה להגדרות
      </a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 20px', fontSize: 20 }}>ניהול משתמשים</h1>

      {!canManage && !isOwnerAnywhere && (
        <div style={{
          background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8,
          padding: '12px 16px', fontSize: 12.5, marginBottom: 20, color: '#92400e',
        }}>
          רק owner או admin יכולים להזמין ולנהל משתמשים ב-workspace הזה.
        </div>
      )}

      {canManage && <InviteForm />}

      {isOwnerAnywhere ? (
        <AllUsersTable workspaces={allWorkspaces} users={allUsers} currentUserId={user.id} />
      ) : canManage ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
            חברי הצוות ({members?.length || 0})
          </div>
          {(members || []).map((m) => (
            <MemberRow
              key={m.user_id}
              userId={m.user_id}
              name={m.profiles?.name || 'משתמש'}
              role={m.role}
              workspaceId={workspaceId}
              email={m.email}
              allMemberships={m.allMemberships}
              isSelf={m.user_id === user.id}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
