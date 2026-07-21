import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { calculateAge, calculateHebrewDate } from '../../lib/hebrewDate';
import { updateContactNotes } from '../actions';
import { toggleTask } from '../../tasks/actions';
import ContactDetailClient from './ContactDetailClient';

// שולף את כל הנתונים בצד השרת ומעביר ל-ContactDetailClient (שם נמצא
// כל הלוגיקה האינטראקטיבית - לשוניות מחלקה, שלבים, עריכה וכו').
// isModal שולט רק בהבדלים קוסמטיים (קישור חזרה, ריווח חיצוני).
export default async function ContactDetailContent({ contactId, isModal }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // אנשי קשר משותפים לכולם - לא מסוננים לפי workspace
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();

  if (!contact) notFound();

  const [{ data: departmentRows }, { data: allWorkspaces }, { data: meetings }, { data: tasks }, { data: tagRows }, { data: viewerMemberships }, { data: sentEmailRows }, { data: emailConnections }, { data: sentWhatsappRows }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    supabase
      .from('contact_departments')
      .select('id, stage, closed_reason, workspace_id, agent_id, last_activity_at, workspaces:workspace_id (name), lead_inquiries (reason, note, created_at)')
      .eq('contact_id', contact.id),
    supabase.from('workspaces').select('id, name').order('name'),
    supabase
      .from('meetings')
      .select('id, title, meeting_date, meeting_time, type, location, notes')
      .eq('contact_id', contact.id)
      .order('meeting_date', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, due_date, done')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false }),
    supabase.from('contacts').select('tags'),
    supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id),
    supabase
      .from('sent_emails')
      .select('id, workspace_id, from_address, subject, body, sent_at')
      .eq('contact_id', contact.id)
      .order('sent_at', { ascending: false }),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase
      .from('sent_whatsapp')
      .select('id, workspace_id, phone, reason, kind, message, direction, sent_at')
      .eq('contact_id', contact.id)
      .order('sent_at', { ascending: false }),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
  ]);

  // שם הנציג המטפל לכל מחלקה - agent_id הוא user id, לא FK ל-profiles
  // (כמו בכל שאר המערכת), אז שולפים בנפרד ומצרפים ידנית. כשאין name
  // בפרופיל, נופלים חזרה לכתובת המייל (לא למחרוזת "משתמש" גנרית שלא
  // עוזרת להבחין בין אנשים שונים)
  const admin = createAdminClient();
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));

  const agentIds = Array.from(new Set((departmentRows || []).map((r) => r.agent_id).filter(Boolean)));
  const { data: agentProfiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const agentNameById = Object.fromEntries((agentProfiles || []).map((p) => [p.id, p.name || emailById[p.id] || 'משתמש']));

  // רשימת נציגים/מנהלים לכל מחלקה שאיש הקשר משויך אליה - לבחירת "נציג
  // מטפל" ידנית מהכרטיס עצמו
  const workspaceIds = Array.from(new Set((departmentRows || []).map((r) => r.workspace_id)));
  const { data: memberRows } = workspaceIds.length
    ? await supabase.from('workspace_members').select('workspace_id, user_id').in('workspace_id', workspaceIds)
    : { data: [] };
  const memberIds = Array.from(new Set((memberRows || []).map((m) => m.user_id)));
  const { data: memberProfiles } = memberIds.length
    ? await supabase.from('profiles').select('id, name').in('id', memberIds)
    : { data: [] };
  const memberNameById = Object.fromEntries((memberProfiles || []).map((p) => [p.id, p.name || emailById[p.id] || 'משתמש']));
  const agentsByWorkspace = {};
  for (const m of memberRows || []) {
    agentsByWorkspace[m.workspace_id] = agentsByWorkspace[m.workspace_id] || [];
    agentsByWorkspace[m.workspace_id].push({ id: m.user_id, name: memberNameById[m.user_id] || 'משתמש' });
  }

  const departments = (departmentRows || []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces?.name || 'מחלקה',
    stage: row.stage,
    closedReason: row.closed_reason,
    agentId: row.agent_id,
    agentName: agentNameById[row.agent_id] || null,
    lastActivityAt: row.last_activity_at,
    inquiries: [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));

  const viewerWorkspaceIds = (viewerMemberships || []).map((m) => m.workspace_id);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const age = calculateAge(contact.birth_date);
  const hebrewDate = calculateHebrewDate(contact.birth_date);
  const connections = emailConnections || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const nextMeeting = (meetings || [])
    .filter((m) => m.meeting_date >= todayStr)
    .sort((a, b) => new Date(`${a.meeting_date}T${a.meeting_time || '00:00'}`) - new Date(`${b.meeting_date}T${b.meeting_time || '00:00'}`))[0] || null;
  const openTasksCount = (tasks || []).filter((t) => !t.done).length;

  let relatedContact = null;
  if (contact.related_contact_id) {
    const { data: rc } = await supabase.from('contacts').select('id, first, last').eq('id', contact.related_contact_id).single();
    relatedContact = rc;
  }

  return (
    <ContactDetailClient
      contact={contact}
      departments={departments}
      allWorkspaces={allWorkspaces || []}
      viewerWorkspaceIds={viewerWorkspaceIds}
      meetings={meetings || []}
      tasks={tasks || []}
      existingTags={existingTags}
      age={age}
      hebrewDate={hebrewDate}
      isModal={isModal}
      toggleTaskAction={toggleTask}
      updateNotesAction={updateContactNotes}
      sentEmails={sentEmailRows || []}
      emailConnections={connections}
      sentWhatsapp={sentWhatsappRows || []}
      whatsappTemplates={whatsappTemplates || []}
      emailTemplates={emailTemplates || []}
      nextMeeting={nextMeeting}
      openTasksCount={openTasksCount}
      relatedContact={relatedContact}
      agentsByWorkspace={agentsByWorkspace}
    />
  );
}
