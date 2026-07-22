import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import AddContactForm from './AddContactForm';
import ContactsBoard from './ContactsBoard';
import { DownloadTemplateButton, ExportContactsButton, ImportContactsButton } from './ImportExportButtons';

export default async function ContactsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // אנשי קשר משותפים לכולם - לא מסוננים לפי workspace (בניגוד ללידים)
  const [{ data }, { data: workspaces }, { data: profile }, { data: sendConnections }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first, last, idnum, phone, phone2, email, dept, tags, source, frozen, created_at, contact_departments (workspace_id, stage, workspaces:workspace_id (name))')
      .order('created_at', { ascending: false }),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
  ]);
  const allContacts = (data || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({ workspaceId: d.workspace_id, name: d.workspaces?.name || 'מחלקה', stage: d.stage })),
  }));

  const allTags = Array.from(new Set(allContacts.flatMap((c) => c.tags || []))).sort();
  const allDepartments = Array.from(new Set(allContacts.flatMap((c) => c.departments.map((d) => d.name)))).sort();

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: 20 }}>אנשי קשר</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            {allContacts.length} אנשי קשר (כל המחלקות)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <DownloadTemplateButton />
          <ImportContactsButton workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} />
          <ExportContactsButton contacts={allContacts} />
          <AddContactForm workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} existingTags={allTags} />
        </div>
      </div>

      <ContactsBoard
        contacts={allContacts}
        allTags={allTags}
        allDepartments={allDepartments}
        sendConnections={sendConnections || []}
        whatsappTemplates={whatsappTemplates || []}
        emailTemplates={emailTemplates || []}
      />
    </div>
  );
}
