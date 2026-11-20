import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getAllPipelinesCached } from '../../lib/pipelines';
import ListBuilderClient from './ListBuilderClient';

// "בניית רשימה" - סינון-רב-תנאי-בשרת + ייצוא-CSV + רישום-בהיסטוריה (לא
// תגית-קבועה). owner/admin בלבד, כמו ייבוא/ייצוא-נתונים.
export default async function ContactListsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isManagerOfAnyWorkspace(supabase, user.id))) redirect('/dashboard/settings');

  const [{ data: workspaces }, { data: courses }, { byWorkspace: pipelinesByWorkspace }] = await Promise.all([
    supabase.from('workspaces').select('id, name').order('name'),
    supabase.from('courses').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    getAllPipelinesCached(),
  ]);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '14px 0 4px' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: 20 }}>בניית רשימה</h1>
        <a href="/dashboard/settings/lists/history" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>כל הרשימות ←</a>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        סינון קבוצת-אנשי-קשר, ייצוא לקובץ, ורישום-בהיסטוריה-שלהם שנכנסו לרשימה הזו (לא תגית קבועה).
      </p>
      <ListBuilderClient
        workspaces={workspaces || []}
        courses={courses || []}
        pipelinesByWorkspace={pipelinesByWorkspace || {}}
      />
    </div>
  );
}
