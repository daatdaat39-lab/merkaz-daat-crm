import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import NewLeadToast from './components/NewLeadToast';

export default async function DashboardLayout({ children, modal }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, level, current_workspace_id')
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

  let currentWorkspaceId = profile?.current_workspace_id || null;

  // אם למשתמש אין current_workspace_id שמור (למשל משתמש חדש שהוזמן ולא נבחרה
  // לו ברירת מחדל), אבל יש לו חברות אמיתית באיזשהו workspace - קובעים אחת
  // ושומרים אותה בפועל בפרופיל. בלי זה, כל עמוד בנפרד (לידים/משימות/יומן
  // וכו') קורא current_workspace_id ישירות מה-DB ומקבל null, כך שהתוכן
  // נראה ריק גם שהסיידבר מראה הכל תקין (כי כאן יש נפילה זמנית בזיכרון בלבד).
  if (!currentWorkspaceId && workspaces.length > 0) {
    currentWorkspaceId = workspaces[0].id;
    await supabase.from('profiles').update({ current_workspace_id: currentWorkspaceId }).eq('id', user.id);
  }

  const currentWorkspaceIndex = workspaces.findIndex((w) => w.id === currentWorkspaceId);
  const hasAccessToCurrent = workspaces.some((w) => w.id === currentWorkspaceId && !w.restricted);

  // לכפתור "איש קשר חדש" הגלובלי בסרגל העליון - כל המחלקות (לא רק אלה
  // שהמשתמש חבר בהן, כמו במסך אנשי הקשר) והתגיות הקיימות במערכת
  const [{ data: allWorkspaces }, { data: tagRows }] = await Promise.all([
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('contacts').select('tags'),
  ]);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();

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
        <Topbar
          workspaceColorIndex={currentWorkspaceIndex}
          workspaces={allWorkspaces || []}
          defaultWorkspaceId={currentWorkspaceId || ''}
          existingTags={existingTags}
        />
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
      {modal}
      <NewLeadToast workspaceId={currentWorkspaceId} />
    </div>
  );
}
