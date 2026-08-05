import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAllExtraFields } from '../../lib/extraFields';
import MyPreferencesClient from './MyPreferencesClient';
import ThemeToggleSection from './ThemeToggleSection';

// עמוד "ההעדפות שלי" - אישי לגמרי, בלי הרשאת owner/admin (בניגוד לכל
// שאר עמודי ההגדרות). מרכז במקום אחד את כל המחלקות שהמשתמש חבר בהן,
// עם רשימת שדות מותאמים אישית לכל אחת - אותה פעולה בדיוק כמו הפופ-אובר
// המהיר על הקוביות בכרטיס איש קשר (⚙ ליד "נתוני תרומה"/"מצב לימודים").
export default async function MyPreferencesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: memberships }, { data: profile }] = await Promise.all([
    supabase.from('workspace_members').select('workspace_id, workspaces:workspace_id (id, name)').eq('user_id', user.id),
    supabase.from('profiles').select('hidden_extra_fields, theme_preference').eq('id', user.id).single(),
  ]);

  const extraFieldsByWorkspaceName = await getAllExtraFields(supabase);
  const workspaces = (memberships || [])
    .filter((m) => m.workspaces)
    .map((m) => ({ id: m.workspaces.id, name: m.workspaces.name, fields: extraFieldsByWorkspaceName[m.workspaces.name] || [] }))
    .filter((w) => w.fields.length > 0);

  const hiddenByWorkspace = profile?.hidden_extra_fields || {};

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>ההעדפות שלי</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        אישי לגמרי - משפיע רק על מה שאתה רואה, לא על נציגים אחרים. לכל מחלקה, בחר אילו שדות מחלקתיים מוצגים לך בכרטיס איש קשר.
      </p>
      <ThemeToggleSection initialTheme={profile?.theme_preference || 'system'} />
      {workspaces.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אינך חבר במחלקה עם שדות מותאמים אישית.</div>
      )}
      <MyPreferencesClient workspaces={workspaces} hiddenByWorkspace={hiddenByWorkspace} />
    </div>
  );
}
