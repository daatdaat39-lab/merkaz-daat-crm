import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { sendChatMessage } from './actions';
import ChatPanel from './ChatPanel';

const MESSAGE_LIMIT = 200;

// צ'אט פנימי - ערוץ אחד משותף לכל מחלקה (workspace הפעיל של המשתמש),
// עם עדכון בזמן אמת (ChatPanel.js) כדי שהודעות יופיעו אצל כולם מיד בלי רענון.
export default async function ChatPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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

    // אין קשר-מפתח (FK) בין workspace_members ל-profiles במסד, אז שולפים
    // בשתי שאילתות ומצרפים ידנית (כמו בעמודי המשימות/יומן/לידים)
    const memberIds = (workspaceMembers || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    members = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));
    const nameById = Object.fromEntries(members.map((m) => [m.id, m.name]));

    messages = (msgRows || []).map((m) => ({ ...m, senderName: nameById[m.sender_id] || 'משתמש' }));
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>
        צ'אט צוות{workspaceId ? ` — ${workspaceName}` : ''}
      </h1>

      {!workspaceId ? (
        <div style={{ fontSize: 13, color: '#9b9b9b' }}>יש לבחור מחלקה פעילה כדי לצ'וט</div>
      ) : (
        <ChatPanel
          workspaceId={workspaceId}
          currentUserId={user.id}
          currentUserName={members.find((m) => m.id === user.id)?.name || 'אני'}
          members={members}
          initialMessages={messages}
          sendAction={sendChatMessage}
        />
      )}
    </div>
  );
}
