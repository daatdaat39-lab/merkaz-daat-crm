import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import FieldsClient from './FieldsClient';

// ניהול שדות מחלקתיים דינמיים (מיגרציה 0043) - מחליף את EXTRA_FIELDS
// הקבוע ב-components/pipelines.js. owner/admin בלבד (נבדק שוב לכל
// מחלקה בנפרד בתוך actions.js, אותו דפוס בדיוק כמו settings/pipelines).
export default async function FieldsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לערוך שדות מחלקתיים.
        </div>
      </div>
    );
  }

  const { data: workspaces } = await supabase.from('workspaces').select('id, name').order('created_at', { ascending: true });

  const { data: fieldRows } = await supabase
    .from('workspace_extra_fields')
    .select('id, workspace_id, field_key, label, type, options, sort_order')
    .order('sort_order', { ascending: true });

  const fieldsByWorkspaceId = {};
  for (const row of fieldRows || []) {
    fieldsByWorkspaceId[row.workspace_id] = fieldsByWorkspaceId[row.workspace_id] || [];
    fieldsByWorkspaceId[row.workspace_id].push(row);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>שדות מחלקתיים</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        שדות נוספים לכל מחלקה - מופיעים בכרטיס איש קשר, בטבלת הלידים, בייבוא נתונים ובסינון. המפתח הטכני קבוע לאחר יצירה.
      </p>
      <FieldsClient workspaces={workspaces || []} fieldsByWorkspaceId={fieldsByWorkspaceId} />
    </div>
  );
}
