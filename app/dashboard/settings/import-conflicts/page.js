import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import { getAllExtraFields } from '../../lib/extraFields';
import ImportConflictsClient from './ImportConflictsClient';

const PAGE_SIZE = 50;

// שולף את כל השורות התואמות, בדפדוף (PostgREST מגביל תשובה ל-1000
// שורות כברירת מחדל, גם בלי .range() מפורש) - נדרש כאן כי אחרי ניקוי
// הכפילויות (0078/0079) עדיין יכולות להיות אלפי שורות pending.
async function fetchAllPending(supabase, select) {
  let all = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('import_conflicts').select(select).eq('status', 'pending').range(from, from + 999);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// "קונפליקטים בייבוא" - תור קונפליקטים שנוצרו מייבוא (import_conflicts,
// מיגרציה 0048): ערכים מקובץ שהתנגשו עם ערך קיים אצל איש קשר ולא
// נדרסו/נזרקו בשקט. שם שונה בכוונה מ"בדיקת כפליות" הקיים (settings/
// duplicates) - זה קונפליקט בערך שדה בודד, לא כפילות כרטיס שלם.
//
// בנוי כדף-קיבוץ (לא רשימה שטוחה בלי הגבלה - עם אלפי שורות זה קרס):
// סיכום מספרים לכל (field_key, workspace) בלי לטעון את השורות המלאות,
// ולאחר בחירת קבוצה - שורות מלאות בדפדוף (?field=...&workspace=...&page=N).
export default async function ImportConflictsPage({ searchParams }) {
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

  const summaryRows = await fetchAllPending(supabase, 'field_key, field_label, workspace_id, workspaces:workspace_id (name)');
  const groupsByKey = new Map();
  for (const r of summaryRows) {
    const gKey = `${r.field_key}|${r.workspace_id || ''}`;
    if (!groupsByKey.has(gKey)) {
      groupsByKey.set(gKey, { fieldKey: r.field_key, fieldLabel: r.field_label, workspaceId: r.workspace_id, workspaceName: r.workspaces?.name || '', count: 0 });
    }
    groupsByKey.get(gKey).count++;
  }
  const groups = Array.from(groupsByKey.values()).sort((a, b) => b.count - a.count);

  const selectedField = searchParams?.field || null;
  const selectedWorkspace = searchParams?.workspace || null;
  const page = Math.max(1, Number(searchParams?.page) || 1);

  let selectedGroupRows = [];
  let selectedGroupTotal = 0;
  if (selectedField) {
    let query = supabase.from('import_conflicts')
      .select('id, contact_id, workspace_id, field_key, field_label, existing_value, new_value, source_system, batch_label, created_at, contacts:contact_id (first, last), workspaces:workspace_id (name)', { count: 'exact' })
      .eq('status', 'pending').eq('field_key', selectedField);
    query = selectedWorkspace ? query.eq('workspace_id', selectedWorkspace) : query.is('workspace_id', null);
    const { data, count } = await query.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    selectedGroupRows = data || [];
    selectedGroupTotal = count || 0;
  }

  const extraFieldsByWorkspaceName = await getAllExtraFields(supabase);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>קונפליקטים בייבוא</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        ערכים מקבצי ייבוא שהתנגשו עם נתון קיים אצל איש קשר - שום דבר מהקובץ לא נמחק, רק ממתין לבחירה שלכם: להשאיר את הקיים, להחליף בחדש, או (טלפון/מייל בלבד) לשמור את שניהם. מקובצים לפי שדה+מחלקה כדי לאפשר פתרון של קבוצה שלמה בבת אחת.
      </p>
      <ImportConflictsClient
        groups={groups}
        selectedField={selectedField}
        selectedWorkspace={selectedWorkspace}
        page={page}
        pageSize={PAGE_SIZE}
        selectedGroupRows={selectedGroupRows}
        selectedGroupTotal={selectedGroupTotal}
        extraFieldsByWorkspaceName={extraFieldsByWorkspaceName}
      />
    </div>
  );
}
