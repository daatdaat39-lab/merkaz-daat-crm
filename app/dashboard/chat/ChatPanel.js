'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '../../../lib/supabase/client';

function formatTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('he-IL')} ${time}`;
}

// ערוץ צ'אט אחד למחלקה - טוען הודעות קיימות מהשרת, ואז נרשם ל-Supabase
// Realtime על טבלת chat_messages (מסונן לפי workspace_id) כדי שהודעות
// חדשות (מכל מי שכתב, כולל המשתמש עצמו בכרטיסיה אחרת) יופיעו מיד.
export default function ChatPanel({ workspaceId, currentUserId, currentUserName, members, initialMessages, sendAction }) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const listRef = useRef(null);
  const nameById = Object.fromEntries(members.map((m) => [m.id, m.name]));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, { ...payload.new, senderName: nameById[payload.new.sender_id] || 'משתמש' }];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function handleSend() {
    const body = text.trim();
    if (!body) return;
    setText('');
    startTransition(async () => {
      await sendAction(workspaceId, body);
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div ref={listRef} style={{ height: 440, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 13, color: '#9b9b9b', margin: 'auto' }}>אין עדיין הודעות בערוץ - תהיו הראשונים לכתוב!</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '75%', padding: '8px 12px', borderRadius: 10, fontSize: 13,
                background: mine ? '#0a0a0a' : '#f2f2f2', color: mine ? '#fff' : '#0a0a0a',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.body}
              </div>
              <div style={{ fontSize: 10.5, color: '#9b9b9b', marginTop: 3 }}>
                {mine ? 'אני' : (m.senderName || nameById[m.sender_id] || 'משתמש')} · {formatTime(m.created_at)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #f0f0f0' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="כתבו הודעה... (Enter לשליחה, Shift+Enter לשורה חדשה)"
          rows={1}
          style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 6, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={isPending || !text.trim()}
          style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '0 18px', fontSize: 13, cursor: 'pointer' }}
        >
          שליחה
        </button>
      </div>
    </div>
  );
}
