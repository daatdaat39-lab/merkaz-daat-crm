import { createClient } from '../../../../lib/supabase/server';
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
      .select('id, stage, closed_reason, workspace_id, workspaces:workspace_id (name), lead_inquiries (reason, note, created_at)')
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

  const departments = (departmentRows || []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces?.name || 'מחלקה',
    stage: row.stage,
    closedReason: row.closed_reason,
    inquiries: [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));

  const viewerWorkspaceIds = (viewerMemberships || []).map((m) => m.workspace_id);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const age = calculateAge(contact.birth_date);
  const hebrewDate = calculateHebrewDate(contact.birth_date);
  const connections = emailConnections || [];

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
    />
  );
}
