import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getAllExtraFields } from '../../lib/extraFields';
import ImportConflictsClient from './ImportConflictsClient';

// "קונפליקטים בייבוא" - תור קונפליקטים שנוצרו מייבוא (import_conflicts,
// מיגרציה 0048): ערכים מקובץ שהתנגשו עם ערך קיים אצל איש קשר ולא
// נדרסו/נזרקו בשקט. שם שונה בכוונה מ"בדיקת כפליות" הקיים (settings/
// duplicates) - זה קונפליקט בערך שדה בודד, לא כפילות כרטיס שלם. מסך זה
// הוא הנתיב הנדחה - מי שהעלה קובץ יכול לדחות את הבדיקה לכאן ולעבור
// אחד-אחד מתי שנוח, בנוסף לבדיקה המיידית אחרי הייבוא עצמו (ר.
// DepartmentImportWizard.js).
export default async function ImportConflictsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק owner/admin יכול לבדוק קונפליקטים.
        </div>
      </div>
    );
  }

  const { data: conflicts } = await supabase
    .from('import_conflicts')
    .select('id, contact_id, workspace_id, field_key, field_label, existing_value, new_value, source_system, batch_label, created_at, contacts:contact_id (first, last), workspaces:workspace_id (name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const extraFieldsByWorkspaceName = await getAllExtraFields(supabase);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>קונפליקטים בייבוא</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        ערכים מקבצי ייבוא שהתנגשו עם נתון קיים אצל איש קשר - שום דבר מהקובץ לא נמחק, רק ממתין לבחירה שלכם: להשאיר את הקיים, להחליף בחדש, או (טלפון/מייל בלבד) לשמור את שניהם.
      </p>
      <ImportConflictsClient conflicts={conflicts || []} extraFieldsByWorkspaceName={extraFieldsByWorkspaceName} />
    </div>
  );
}
