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
    .map((m) => ({ id: m.workspaces.id, name: m.workspaces.name, role: m.role, restricted: false }));

  // ה-workspace הראשי ("מרכז דעת — ראשי") מוצג לכולם בבורר, גם אם המשתמש לא חבר בו בפועל —
  // אבל אז הגישה אליו תיחסם עם הודעה במקום להציג תוכן
  const { data: mainWs } = await supabase
    .from('workspaces')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const mainWorkspaceId = mainWs?.id || null;
  const alreadyHasMain = workspaces.some((w) => w.id === mainWorkspaceId);
  if (mainWs && !alreadyHasMain) {
    workspaces.unshift({ id: mainWs.id, name: mainWs.name, role: null, restricted: true });
  }

  const currentWorkspaceId = profile?.current_workspace_id || workspaces[0]?.id || null;
  const currentWorkspaceIndex = workspaces.findIndex((w) => w.id === currentWorkspaceId);
  const hasAccessToCurrent = workspaces.some((w) => w.id === currentWorkspaceId && !w.restricted);

  async function switchWorkspace(formData) {
    'use server';
    const workspaceId = formData.get('workspace_id');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !workspaceId) return;

    // ה-workspace הראשי תמיד ניתן לבחירה (הגישה אליו נבדקת ומוצגת בנפרד)
    const { data: mainWs } = await supabase
      .from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).single();

    if (workspaceId !== mainWs?.id) {
      // לכל workspace אחר מוודאים שהמשתמש באמת חבר בו לפני שמעדכנים
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .single();

      if (!membership) return;
    }

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
          {hasAccessToCurrent ? children : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 10, textAlign: 'center', padding: 40,
            }}>
              <div style={{ fontSize: 40 }}>🔒</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>אין לך גישה למחלקה זו</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 340 }}>
                "{workspaces.find((w) => w.id === currentWorkspaceId)?.name}" הוא workspace מוגבל.
                פנה למנהל המערכת אם אתה זקוק לגישה, או עבור ל-workspace אחר מהתפריט בצד.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
