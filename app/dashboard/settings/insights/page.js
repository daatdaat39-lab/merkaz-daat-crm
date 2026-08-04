import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import InsightsClient from './InsightsClient';

// מרכז תובנות AI למנהלים - מנתח מדדים אמיתיים (לא ממציא נתונים) ומציע
// עד 4 תובנות, עם אפשרות "החלה" לפעולה צרה ומוגדרת-מראש בלבד (הוספת
// אוטומציית תזכורת-פולו-אפ לשלב) - ר' actions.js לעקרון הבטיחות המלא.
export default async function InsightsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('current_workspace_id, workspaces:current_workspace_id (id, name)').eq('id', user.id).single();
  const workspaceId = profile?.current_workspace_id;
  const workspaceName = profile?.workspaces?.name;

  const allowed = workspaceId ? await isManagerOfWorkspace(supabase, user.id, workspaceId) : false;
  if (!allowed) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin של המחלקה הפעילה יכול לצפות בתובנות AI.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>💡 תובנות והצעות AI</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        ניתוח מדדים אמיתיים מ-"{workspaceName}" (לידים תקועים, סיבות סגירה נפוצות, שלבים בלי אוטומציה). לא רץ אוטומטית - לחץ "נתח מחדש" כשתרצה.
      </p>
      <InsightsClient workspaceId={workspaceId} workspaceName={workspaceName} />
    </div>
  );
}
