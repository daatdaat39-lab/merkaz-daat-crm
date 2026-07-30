import { redirect } from 'next/navigation';
import { sendChatMessage } from './actions';
import { loadChatBootstrap } from './loadChatBootstrap';
import ChatPanel from './ChatPanel';
import PopOutButton from '../components/PopOutButton';

// צ'אט פנימי - ערוץ אחד משותף לכל מחלקה (workspace הפעיל של המשתמש),
// עם עדכון בזמן אמת (ChatPanel.js) כדי שהודעות יופיעו אצל כולם מיד בלי רענון.
export default async function ChatPage() {
  const data = await loadChatBootstrap();
  if (data.redirectToLogin) redirect('/login');
  const { workspaceId, workspaceName } = data.props;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>
          צ'אט צוות{workspaceId ? ` — ${workspaceName}` : ''}
        </h1>
        {workspaceId && (
          <PopOutButton
            windowId="chat"
            kind="chat"
            title={`צ'אט צוות — ${workspaceName}`}
            windowProps={{}}
          />
        )}
      </div>

      {!workspaceId ? (
        <div style={{ fontSize: 13, color: '#9b9b9b' }}>יש לבחור מחלקה פעילה כדי לצ'וט</div>
      ) : (
        <ChatPanel {...data.props} sendAction={sendChatMessage} />
      )}
    </div>
  );
}
