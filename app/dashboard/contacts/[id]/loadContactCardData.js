'use server';

import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { groupTagsByDepartment } from '../../lib/tagGroups';

// טוען את כל הנתונים של כרטיס איש קשר - מופרד מ-ContactDetailContent.js
// כדי שאותה לוגיקה תהיה קריאה גם משם (עמוד/מודל רגיל, ניתוב של Next)
// וגם מ-FloatingContactCard.js (חלון צף, נטען דרך קריאת לקוח ל-server action).
export async function loadContactCardData(contactId) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirectToLogin: true };

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();

  if (!contact) return { notFound: true };

  const [{ data: departmentRows }, { data: allWorkspaces }, { data: meetings }, { data: tasks }, { data: tagRows }, { data: viewerMemberships }, { data: sentEmailRows }, { data: emailConnections }, { data: sentWhatsappRows }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    supabase
      .from('contact_departments')
      .select('id, stage, closed_reason, workspace_id, agent_id, last_activity_at, extra_fields, workspaces:workspace_id (name), lead_inquiries (reason, note, created_at)')
      .eq('contact_id', contact.id),
    supabase.from('workspaces').select('id, name').order('name'),
    supabase
      .from('meetings')
      .select('id, title, meeting_date, meeting_time, type, location, notes, workspace_id, zoom_join_url')
      .eq('contact_id', contact.id)
      .order('meeting_date', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, due_date, done, workspace_id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false }),
    supabase.from('contacts').select('tags, contact_departments (workspaces:workspace_id (name))'),
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

  const admin = createAdminClient();
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));

  const agentIds = Array.from(new Set((departmentRows || []).map((r) => r.agent_id).filter(Boolean)));
  const { data: agentProfiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const agentNameById = Object.fromEntries((agentProfiles || []).map((p) => [p.id, p.name || emailById[p.id] || 'משתמש']));

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
    extraFields: row.extra_fields || {},
    inquiries: [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));

  const workspaceNameById = Object.fromEntries((allWorkspaces || []).map((w) => [w.id, w.name]));
  const allInquiries = departments
    .flatMap((d) => (d.inquiries || []).map((inq) => ({ ...inq, workspaceName: d.workspaceName })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const viewerWorkspaceIds = (viewerMemberships || []).map((m) => m.workspace_id);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const tagGroups = groupTagsByDepartment(
    (tagRows || []).map((c) => ({ tags: c.tags, departments: (c.contact_departments || []).map((d) => ({ name: d.workspaces?.name })) }))
  );
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

  return {
    props: {
      contact,
      departments,
      allWorkspaces: allWorkspaces || [],
      viewerWorkspaceIds,
      meetings: meetings || [],
      tasks: tasks || [],
      existingTags,
      tagGroups,
      sentEmails: sentEmailRows || [],
      emailConnections: connections,
      sentWhatsapp: sentWhatsappRows || [],
      whatsappTemplates: whatsappTemplates || [],
      emailTemplates: emailTemplates || [],
      nextMeeting,
      openTasksCount,
      relatedContact,
      agentsByWorkspace,
      allInquiries,
      workspaceNameById,
    },
  };
}
