'use client';

import { useEffect, useState } from 'react';
import { sendChatMessage } from './actions';
import ChatPanel from './ChatPanel';

// תוכן הצ'אט בתוך חלון צף - נטען בצד הלקוח דרך נקודת קצה REST רגילה
// (api/chat-bootstrap, שעוטפת את loadChatBootstrap.js המשותפת עם
// page.js הרגיל) כדי שהצ'אט יישאר פתוח/ממוזער גם כשעוברים לעמוד אחר.
export default function FloatingChat() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/chat-bootstrap')
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      });
    return () => { cancelled = true; };
  }, []);

  if (!data) return <div style={{ fontSize: 13, color: '#9b9b9b' }}>טוען...</div>;
  if (!data.workspaceId) return <div style={{ fontSize: 13, color: '#9b9b9b' }}>יש לבחור מחלקה פעילה כדי לצ'וט</div>;

  return <ChatPanel {...data} sendAction={sendChatMessage} />;
}
