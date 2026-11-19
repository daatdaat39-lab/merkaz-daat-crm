import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import AddContactForm from './AddContactForm';
import ContactsBoard from './ContactsBoard';
import { groupTagsByDepartment } from '../lib/tagGroups';
import { getAllPipelinesCached } from '../lib/pipelines';
import { getAllExtraFieldsCached } from '../lib/extraFields';
import { getAllContactTagRows } from '../lib/allContactTags';
import { fetchContactsPaged, fetchWorkspaceContactIds, shapeContacts } from './contactsListData';

export default async function ContactsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // טעינה-ראשונה מצומצמת-למחלקה-הפעילה-בלבד (לא "כל אנשי-הקשר") -
  // ברוב-הזמן נציג עובד בתוך מחלקה-אחת, אז-אין-סיבה-להביא-את-כל-6,500+
  // בכל-טעינת-עמוד. "חיפוש"/"סינון" בלקוח (ContactsBoard.js) מרחיבים
  // לכל-המערכת-בפועל, רק-כש-באמת-צריך (fetchAllContactsAction.js) -
  // הדף-הזה לא-צריך-לדעת-על-זה, רק-לספק-את-ברירת-המחדל-המהירה.
  const { data: profileForScope } = await supabase
    .from('profiles').select('current_workspace_id').eq('id', user.id).single();
  const currentWorkspaceId = profileForScope?.current_workspace_id || null;
  const scopedContactIds = currentWorkspaceId ? await fetchWorkspaceContactIds(supabase, currentWorkspaceId) : null;

  const [
    data,
    { data: workspaces },
    { data: sendConnections },
    { data: whatsappTemplates },
    { data: emailTemplates },
    { byWorkspace: pipelinesByWorkspace, labels: stageLabels, colors: stageColors },
    extraFieldsByDept,
    tagRows,
  ] = await Promise.all([
    fetchContactsPaged(supabase, scopedContactIds),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text, sort_order, workspace_id, stage_key, category, course_id, is_active').order('sort_order').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body, workspace_id, stage_key, category, course_id, is_active').order('created_at'),
    getAllPipelinesCached(),
    getAllExtraFieldsCached(),
    getAllContactTagRows(),
  ]);
  const scopedContacts = shapeContacts(data);

  // תגיות/מחלקות-לבורר - תמיד מכל-המערכת (לא-ממה-שבפועל-נטען), אחרת
  // רשימת "כל המחלקות" הייתה-מוצגת-ריקה-כמעט-לגמרי בטעינה-הראשונה.
  const allTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const tagGroups = groupTagsByDepartment(
    (tagRows || []).map((c) => ({ tags: c.tags, departments: (c.contact_departments || []).map((d) => ({ name: d.workspaces?.name })) }))
  );
  const allDepartments = Array.from(new Set((workspaces || []).map((w) => w.name))).sort();
  const currentWorkspaceName = (workspaces || []).find((w) => w.id === currentWorkspaceId)?.name || null;

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px', background: 'var(--k-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--k-font-display)', margin: 0, fontSize: 30, color: 'var(--k-text)' }}>אנשי קשר</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--k-text-muted)', fontSize: 12.5 }}>
            {scopedContacts.length} אנשי קשר{currentWorkspaceName ? ` (${currentWorkspaceName})` : ' (כל המחלקות)'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <AddContactForm workspaces={workspaces || []} defaultWorkspaceId={currentWorkspaceId || ''} existingTags={allTags} tagGroups={tagGroups} />
        </div>
      </div>

      <ContactsBoard
        contacts={scopedContacts}
        currentWorkspaceName={currentWorkspaceName}
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
