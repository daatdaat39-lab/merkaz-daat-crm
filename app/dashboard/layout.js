import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

export default async function DashboardLayout({ children }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, level, dept, current_workspace_id')
    .eq('id', user.id)
    .single();

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role, workspaces (id, name)')
    .eq('user_id', user.id);

  const workspaces = (memberships || [])
    .filter((m) => m.workspaces)
    .map((m) => ({ id: m.workspaces.id, name: m.workspaces.name, role: m.role }));

  const currentWorkspaceId = profile?.current_workspace_id || workspaces[0]?.id || null;
  const currentWorkspaceIndex = workspaces.findIndex((w) => w.id === currentWorkspaceId);

  async function switchWorkspace(formData) {
    'use server';
    const workspaceId = formData.get('workspace_id');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !workspaceId) return;

    // מוודאים שהמשתמש באמת חבר ב-workspace הזה לפני שמעדכנים
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single();

    if (!membership) return;

    await supabase
      .from('profiles')
      .update({ current_workspace_id: workspaceId })
      .eq('id', user.id);

    redirect('/dashboard/contacts');
  }

  async function handleLogout() {
    'use server';
    const supabase = createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        profile={profile}
        userEmail={user.email}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        switchWorkspaceAction={switchWorkspace}
        logoutAction={handleLogout}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        <Topbar workspaceColorIndex={currentWorkspaceIndex} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
