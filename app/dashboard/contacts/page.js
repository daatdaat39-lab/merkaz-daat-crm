import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, Tag, initials } from '../components/ui';
import ContactQuickActions from '../components/ContactQuickActions';
import AddContactForm from './AddContactForm';
import TagFilter from './TagFilter';
import { DownloadTemplateButton, ExportContactsButton, ImportContactsButton } from './ImportExportButtons';

export default async function ContactsPage({ searchParams }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // אנשי קשר משותפים לכולם - לא מסוננים לפי workspace (בניגוד ללידים)
  const [{ data }, { data: workspaces }, { data: profile }, { data: sendConnections }, { data: whatsappTemplates }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first, last, idnum, phone, phone2, email, dept, tags, source, frozen, created_at, contact_departments (workspace_id, stage, workspaces:workspace_id (name))')
      .order('created_at', { ascending: false }),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
  ]);
  const allContacts = (data || []).map((c) => ({
    ...c,
    departments: (c.contact_departments || []).map((d) => ({ workspaceId: d.workspace_id, name: d.workspaces?.name || 'מחלקה', stage: d.stage })),
  }));

  const allTags = Array.from(new Set(allContacts.flatMap((c) => c.tags || []))).sort();
  const activeTag = searchParams?.tag || '';
  const contacts = activeTag ? allContacts.filter((c) => (c.tags || []).includes(activeTag)) : allContacts;

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: 20 }}>אנשי קשר</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            {contacts.length} אנשי קשר{activeTag ? ` (מסונן לפי "${activeTag}")` : ' (כל המחלקות)'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <TagFilter tags={allTags} />
          <DownloadTemplateButton />
          <ImportContactsButton workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} />
          <ExportContactsButton contacts={contacts} />
          <AddContactForm workspaces={workspaces || []} defaultWorkspaceId={profile?.current_workspace_id || ''} existingTags={allTags} />
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['שם', 'מחלקות', 'טלפון', 'מייל', 'תחום', 'מקור', 'תגיות', 'פעולות מהירות'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                  <span style={{
                    width: 28, height: 28, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0,
                  }}>
                    {initials(c.first, c.last)}
                  </span>
                  {c.first} {c.last}
                </Link>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.departments.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.name}</span>
                      <StageBadge stage={d.stage} />
                    </div>
                  ))}
                  {c.departments.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                </div>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.dept || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.source || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                {(c.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
                {(!c.tags || c.tags.length === 0) && '—'}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <ContactQuickActions
                  contact={{ id: c.id, phone: c.phone, email: c.email, frozen: c.frozen }}
                  departments={c.departments.map((d) => ({ workspaceId: d.workspaceId, workspaceName: d.name }))}
                  sendConnections={sendConnections || []}
                  whatsappTemplates={whatsappTemplates || []}
                />
              </td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr><td colSpan={8} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>אין אנשי קשר</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
