'use server';

import { createClient } from '../../../lib/supabase/server';

const MESSAGE_LIMIT = 200;

// טוען את נתוני הפתיחה של הצ'אט - מופרד מ-page.js כדי שאותה לוגיקה
// תהיה קריאה גם מ-FloatingChat.js (חלון צף, נטען דרך קריאת לקוח).
export async function loadChatBootstrap() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirectToLogin: true };

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, workspaces:current_workspace_id (name)')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;
  const workspaceName = profile?.workspaces?.name || 'מחלקה';

  let messages = [];
  let members = [];
  if (workspaceId) {
    const [{ data: msgRows }, { data: workspaceMembers }] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('id, sender_id, body, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
        .limit(MESSAGE_LIMIT),
      supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
    ]);

    const memberIds = (workspaceMembers || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    members = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));
    const nameById = Object.fromEntries(members.map((m) => [m.id, m.name]));

    messages = (msgRows || []).map((m) => ({ ...m, senderName: nameById[m.sender_id] || 'משתמש' }));
  }

  return {
    props: {
      workspaceId: workspaceId || null,
      workspaceName,
      currentUserId: user.id,
      currentUserName: members.find((m) => m.id === user.id)?.name || 'אני',
      members,
      initialMessages: messages,
    },
  };
}
