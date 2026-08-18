import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AddContactForm from './AddContactForm';
import ContactsBoard from './ContactsBoard';
import { groupTagsByDepartment } from '../lib/tagGroups';
import { getAllPipelines } from '../lib/pipelines';
import { getAllExtraFields } from '../lib/extraFields';

export default async function ContactsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { byWorkspace: pipelinesByWorkspace, labels: stageLabels, colors: stageColors } = await getAllPipelines(supabase);

  // אנשי קשר משותפים לכולם - לא מסוננים לפי workspace (בניגוד ללידים).
  // שולפים בדפים של 1000 (מגבלת ברירת המחדל של PostgREST/Supabase לכל
  // קריאה בודדת) עד שמגיעים לדף לא-מלא - כדי לקבל את כל אנשי הקשר בפועל,
  // לא רק את ה-1000 הראשונים לפי created_at.
  const contactsSelect = 'id, first, last, idnum, phone, phone2, email, dept, tags, source, frozen, created_at, contact_departments (workspace_id, stage, extra_fields, workspaces:workspace_id (name))';
  async function fetchAllContacts() {
    const pageSize = 1000;
    let page = 0;
    let all = [];
    while (true) {
      const { data: pageData } = await supabase
        .from('contacts')
        .select(contactsSelect)
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < pageSize) break;
      page++;
    }
    return all;
  }

  const [data, { data: workspaces }, { data: profile }, { data: sendConnections }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    fetchAllContacts(),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
  ]);
  const allContacts = (data || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({ workspaceId: d.workspace_id, name: d.workspaces?.name || 'מחלקה', stage: d.stage, extraFields: d.extra_fields || {} })),
  }));

  const allTags = Array.from(new Set(allContacts.flatMap((c) => c.tags || []))).sort();
  const allDepartments = Array.from(new Set(allContacts.flatMap((c) => c.departments.map((d) => d.name)))).sort();
  const tagGroups = groupTagsByDepartment(allContacts);
  const extraFieldsByDept = await getAllExtraFields(supabase);

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
          <Link href="/dashboard/settings/import" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
            fontSize: 13, fontWeight: 500, background: 'var(--bg)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', textDecoration: 'none',
          }}>
            📥 ייבוא נתונים
          </Link>
          <AddContactForm workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} existingTags={allTags} tagGroups={tagGroups} />
        </div>
      </div>

      <ContactsBoard
        contacts={allContacts}
        allTags={allTags}
        tagGroups={tagGroups}
        allDepartments={allDepartments}
        sendConnections={sendConnections || []}
        whatsappTemplates={whatsappTemplates || []}
        emailTemplates={emailTemplates || []}
        stageLabels={stageLabels}
        stageColors={stageColors}
        extraFieldsByDept={extraFieldsByDept}
        pipelinesByWorkspace={pipelinesByWorkspace}
      />
    </div>
  );
}
