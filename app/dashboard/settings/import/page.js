import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { DownloadTemplateButton, ExportContactsButton, ImportContactsButton } from '../../contacts/ImportExportButtons';
import DepartmentImportWizard from '../../contacts/DepartmentImportWizard';
import CallHistoryImportWizard from '../../contacts/CallHistoryImportWizard';

// מסך ייעודי לכל כלי הייבוא/ייצוא - הועבר לכאן מעמוד "אנשי קשר" כדי לשמור
// שם עיצוב נקי ומרווח (רק "+ איש קשר חדש"). כל הפעולות עצמן זהות לחלוטין.
export default async function ImportDataPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: contacts }, { data: workspaces }, { data: profile }] = await Promise.all([
    supabase.from('contacts').select('id, first, last, idnum, phone, phone2, email, dept, source, tags'),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
  ]);

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
        <DepartmentImportWizard workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} />
        <CallHistoryImportWizard />
        <ExportContactsButton contacts={contacts || []} />
      </div>
    </div>
  );
}
