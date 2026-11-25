import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import WhatsappInbox from './WhatsappInbox';

// מסך שיחות WhatsApp (whatsapp_conversations, migration 0196): רשימת שיחות
// מצד אחד והשיחה עצמה מצד שני. מוצגות שיחות של המחלקות שהמשתמש חבר בהן,
// ושיחות בלי מחלקה (מספרים לא מזוהים) לכולם. שיחות שממתינות לנו מוצגות
// תמיד - בלי מגבלת זמן - כדי ששום פנייה לא תיעלם מהרשימה.
const HEALTH_KEY = 'whatsapp_pull';

export default async function WhatsappPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const select = 'id, phone, contact_id, workspace_id, contact_department_id, assigned_to, status, waiting_since, last_inbound_at, last_outbound_at, last_message_at, last_message_preview, last_direction, contacts:contact_id (id, first, last), workspaces:workspace_id (name)';

  const [{ data: memberships }, { data: waiting }, { data: recent }, { data: reads }, { data: health }, { data: allWorkspaces }, { data: profile }, { data: templates }, { data: quickReplies }] = await Promise.all([
    supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id),
    supabase.from('whatsapp_conversations').select(select).eq('status', 'waiting_us').order('waiting_since', { ascending: true }).limit(1000),
    supabase.from('whatsapp_conversations').select(select).neq('status', 'waiting_us').order('last_message_at', { ascending: false }).limit(300),
    supabase.from('whatsapp_conversation_reads').select('conversation_id, last_read_at').eq('user_id', user.id),
    supabase.from('integration_health').select('last_success_at, last_error_at, last_error').eq('key', HEALTH_KEY).maybeSingle(),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single(),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text, workspace_id, is_active').order('sort_order').order('created_at'),
    supabase.from('reference_content').select('id, title, body').eq('kind', 'kb').eq('is_active', true).order('sort_order'),
  ]);

  const myWorkspaceIds = new Set((memberships || []).map((m) => m.workspace_id));
  const managedWorkspaceIds = (memberships || []).filter((m) => ['owner', 'admin'].includes(m.role)).map((m) => m.workspace_id);
  const visible = [...(waiting || []), ...(recent || [])].filter((c) => !c.workspace_id || myWorkspaceIds.has(c.workspace_id));

  // שמות הנציגים: בעלי השיחות + חברי המחלקות שלי (לרשימת "העברה לנציג")
  const { data: memberRows } = myWorkspaceIds.size
    ? await supabase.from('workspace_members').select('user_id, workspace_id').in('workspace_id', [...myWorkspaceIds])
    : { data: [] };
  const profileIds = Array.from(new Set([...(memberRows || []).map((m) => m.user_id), ...visible.map((c) => c.assigned_to).filter(Boolean)]));
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, name').in('id', profileIds)
    : { data: [] };
  const agentNames = Object.fromEntries((profiles || []).map((p) => [p.id, p.name || 'נציג']));
  const agentsByWorkspace = {};
  for (const m of memberRows || []) {
    (agentsByWorkspace[m.workspace_id] = agentsByWorkspace[m.workspace_id] || []).push({ id: m.user_id, name: agentNames[m.user_id] || 'נציג' });
  }

  return (
    <WhatsappInbox
      userId={user.id}
      conversations={visible}
      readAtByConversation={Object.fromEntries((reads || []).map((r) => [r.conversation_id, r.last_read_at]))}
      agentNames={agentNames}
      agentsByWorkspace={agentsByWorkspace}
      myWorkspaces={(allWorkspaces || []).filter((w) => myWorkspaceIds.has(w.id))}
      managedWorkspaceIds={managedWorkspaceIds}
      allWorkspaces={allWorkspaces || []}
      defaultWorkspaceId={profile?.current_workspace_id || ''}
      templates={(templates || []).filter((t) => t.is_active !== false)}
      quickReplies={quickReplies || []}
      health={health || null}
      initialConversationId={typeof searchParams?.c === 'string' ? searchParams.c : null}
    />
  );
}
