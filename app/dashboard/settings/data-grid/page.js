import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import DataGridClient from './DataGridClient';

// מסך ניהול נתונים מרכזי (Data Grid) - טבלת עריכה מהירה לכל אנשי הקשר
// של מחלקה: שדות בסיס + שדות נוספים דינמיים + שלב, הכל בעריכה בשורה.
// owner/admin בלבד, ונטענת כאן רק רשימת המחלקות שהמשתמש עצמו מנהל -
// לא כל המחלקות במערכת - כדי שלא יהיה מצב מבלבל של "רואה מחלקה בבורר
// אבל כל עריכה בה נכשלת" (ר' data-grid/actions.js לבדיקת ההרשאה
// החוזרת בכל פעולת שמירה בפועל).
export default async function DataGridPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק בעלים/מנהל של מחלקה יכול לגשת לניהול נתונים מרכזי.
        </div>
      </div>
    );
  }

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces:workspace_id (id, name)')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin']);

  const managedWorkspaces = (memberships || [])
    .map((m) => m.workspaces)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>ניהול נתונים מרכזי</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        טבלת עריכה מהירה לכל אנשי הקשר של מחלקה - שדות בסיס, שדות נוספים ושלב, ישירות בשורה. עריכה בלבד (לא ליצירת אנשי קשר חדשים).
      </p>
      <DataGridClient workspaces={managedWorkspaces} />
    </div>
  );
}
