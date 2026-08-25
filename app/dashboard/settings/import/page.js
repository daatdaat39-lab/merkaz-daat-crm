import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { DownloadTemplateButton, ExportContactsButton, ImportContactsButton } from '../../contacts/ImportExportButtons';
import DepartmentImportWizard from '../../contacts/DepartmentImportWizard';
import CallHistoryImportWizard from '../../contacts/CallHistoryImportWizard';
import KesherSyncButton from '../../contacts/KesherSyncButton';
import KesherSyncScheduleSettings from '../../contacts/KesherSyncScheduleSettings';
import { getAllExtraFields } from '../../lib/extraFields';
import { isKesherConfigured } from '../../../../lib/kesher/client';

// מסך ייעודי לכל כלי הייבוא/ייצוא - הועבר לכאן מעמוד "אנשי קשר" כדי לשמור
// שם עיצוב נקי ומרווח (רק "+ איש קשר חדש"). כל הפעולות עצמן זהות לחלוטין.
export default async function ImportDataPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // שולפים בדפים של 1000 - זו הרשימה שאשף הייבוא משתמש בה לזיהוי כפילויות
  // בזמן העלאת קובץ; בלי הפאג'ינציה, מגבלת ברירת המחדל של PostgREST
  // חותכת בשקט ל-1000 מתוך 6500+ אנשי קשר, כך שהתאמה אמיתית שנמצאת מחוץ
  // ל-1000 הראשונות (לפי created_at) לא הייתה מתגלה - סיכון ליצירת כפילות.
  async function fetchAllContactsForMatching() {
    const pageSize = 1000;
    let from = 0;
    let all = [];
    while (true) {
      const { data: pageData } = await supabase
        .from('contacts')
        .select('id, first, last, idnum, phone, phone2, email, dept, source, tags')
        .range(from, from + pageSize - 1);
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [contacts, { data: workspaces }, { data: profile }, { count: pendingConflicts }, { data: stages }, { data: lastKesherSync }] = await Promise.all([
    fetchAllContactsForMatching(),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
    supabase.from('import_conflicts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('pipeline_stages').select('workspace_id, stage_key, label, sort_order'),
    supabase.from('kesher_sync_runs').select('to_date').order('run_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lastKesherSyncDate = lastKesherSync?.to_date || null;
  const extraFieldsByWorkspaceName = await getAllExtraFields(supabase);

  // מיפוי שלבי הפייפליין לפי שם מחלקה - משמש את אשף הייבוא כדי לתרגם
  // עמודת "סטטוס" חופשית מקובץ ייבוא לשלב אמיתי (ר' DepartmentImportWizard).
  const workspaceNameById = new Map((workspaces || []).map((w) => [w.id, w.name]));
  const stagesByWorkspaceName = {};
  for (const s of stages || []) {
    const name = workspaceNameById.get(s.workspace_id);
    if (!name) continue;
    (stagesByWorkspaceName[name] ||= []).push({ stage_key: s.stage_key, label: s.label, sort_order: s.sort_order });
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>ייבוא נתונים</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        כל כלי הייבוא והייצוא של אנשי קשר במקום אחד.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <DownloadTemplateButton />
        <ImportContactsButton workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} />
        <DepartmentImportWizard workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} extraFieldsByWorkspaceName={extraFieldsByWorkspaceName} stagesByWorkspaceName={stagesByWorkspaceName} />
        <CallHistoryImportWizard />
        <KesherSyncButton kesherConfigured={isKesherConfigured()} lastSyncDate={lastKesherSyncDate} />
        <KesherSyncScheduleSettings kesherConfigured={isKesherConfigured()} />
        <ExportContactsButton contacts={contacts || []} />
        {pendingConflicts > 0 && (
          <a href="/dashboard/settings/import-conflicts" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
            fontSize: 13, fontWeight: 500, textDecoration: 'none', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
          }}>
            ⚠ {pendingConflicts} קונפליקטים ממתינים לבדיקה
          </a>
        )}
      </div>
    </div>
  );
}
