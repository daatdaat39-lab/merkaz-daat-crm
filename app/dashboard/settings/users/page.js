import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import RoleSelector from './RoleSelector';

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

  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id, role, profiles(name, role)')
    .eq('workspace_id', workspaceId);

  // ============= Server Actions =============

  async function inviteMember(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
    const workspaceId = profile?.current_workspace_id;

    const { data: myMembership } = await supabase
      .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
    if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) return;

    const email = formData.get('email')?.toString().trim();
    const role = formData.get('role')?.toString() || 'member';
    const name = formData.get('name')?.toString().trim() || email?.split('@')[0];
    if (!email || !workspaceId) return;

    let admin;
    try {
      admin = createAdminClient();
    } catch (e) {
      redirect('/dashboard/settings/users?error=' + encodeURIComponent(e.message));
    }

    // ננסה להזמין משתמש חדש
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/auth/callback`,
    });

    let newUserId = invited?.user?.id;

    if (inviteError) {
      // אם המשתמש כבר קיים במערכת (רשום בעבר), נאתר אותו ופשוט נוסיף אותו ל-workspace
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) {
        redirect('/dashboard/settings/users?error=' + encodeURIComponent(inviteError.message));
      }
      newUserId = existing.id;
    }

    if (!newUserId) return;

    // יוצרים/מעדכנים פרופיל
    await admin.from('profiles').upsert({ id: newUserId, name, role: 'user' }, { onConflict: 'id' });

    // מוסיפים כחבר ב-workspace (אם כבר חבר, אין שינוי)
    await admin.from('workspace_members').upsert(
      { workspace_id: workspaceId, user_id: newUserId, role },
      { onConflict: 'workspace_id,user_id' }
    );

    redirect('/dashboard/settings/users');
  }

  async function changeRole(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
    const workspaceId = profile?.current_workspace_id;

    const { data: myMembership } = await supabase
      .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
    if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) return;

    const targetUserId = formData.get('user_id');
    const newRole = formData.get('role');
    await supabase
      .from('workspace_members')
      .update({ role: newRole })
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId);

    redirect('/dashboard/settings/users');
  }

  async function removeMember(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
    const workspaceId = profile?.current_workspace_id;

    const { data: myMembership } = await supabase
      .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
    if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) return;

    const targetUserId = formData.get('user_id');
    if (targetUserId === user.id) return; // אי אפשר להסיר את עצמך

    await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId);

    redirect('/dashboard/settings/users');
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

      {canManage && (
        <form action={inviteMember} style={{
          display: 'flex', gap: 8, marginBottom: 24, background: '#fff', border: '1px solid var(--border)',
          borderRadius: 8, padding: 14, flexWrap: 'wrap',
        }}>
          <input name="name" placeholder="שם מלא" style={{
            border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, minWidth: 130,
          }} />
          <input name="email" type="email" required placeholder="אימייל" style={{
            flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13,
          }} />
          <select name="role" defaultValue="member" style={{
            border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13,
          }}>
            <option value="member">חבר</option>
            <option value="admin">מנהל</option>
            <option value="owner">בעלים</option>
          </select>
          <button type="submit" style={{
            background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 18px', fontSize: 13, cursor: 'pointer',
          }}>
            שליחת הזמנה
          </button>
        </form>
      )}

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
          חברי הצוות ({members?.length || 0})
        </div>
        {(members || []).map((m) => (
          <div key={m.user_id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 18px', borderBottom: '1px solid #f2f2f2', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.profiles?.name || 'משתמש'}</div>
            </div>

            {canManage ? (
              <>
                <RoleSelector userId={m.user_id} currentRole={m.role} action={changeRole} />
                {m.user_id !== user.id && (
                  <form action={removeMember}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button type="submit" style={{
                      background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, cursor: 'pointer',
                    }}>
                      הסרה
                    </button>
                  </form>
                )}
              </>
            ) : (
              <span style={{
                fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 9px', borderRadius: 10,
              }}>
                {m.role === 'owner' ? 'בעלים' : m.role === 'admin' ? 'מנהל' : 'חבר'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
