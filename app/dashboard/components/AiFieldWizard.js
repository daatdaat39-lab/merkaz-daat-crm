'use client';

import { useState, useTransition } from 'react';
import { suggestFieldConfig } from '../settings/fields/aiActions';
import { createField } from '../settings/fields/actions';

const TYPE_LABELS = { text: 'טקסט', number: 'מספר', date: 'תאריך', select: 'בחירה מרשימה', computed: 'מחושב (אוטומטי)' };

// אשף "עם AI" ליצירת שדה - שיחה קצרה בעברית חופשית, עד שה-AI אוסף
// מספיק מידע ומציע תצורת שדה. שום שדה לא נוצר בלי אישור מפורש: ה-AI
// רק מציע (suggestFieldConfig, כבר מאומת בצד שרת), ולחיצת "יצירה" היא
// מה שקוראת בפועל ל-createField הרגיל - אותה פעולה בדיוק כמו בטופס הידני.
export default function AiFieldWizard({ workspaceId, onCreated, onClose }) {
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setError(null);
    const nextConversation = [...conversation, { role: 'user', text }];
    setConversation(nextConversation);
    setInput('');
    startTransition(async () => {
      const res = await suggestFieldConfig(workspaceId, nextConversation);
      if (res?.error) { setError(res.error); return; }
      if (res.needsClarification) {
        setConversation((prev) => [...prev, { role: 'ai', text: res.question }]);
        return;
      }
      setSuggestion(res.suggestion);
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await createField(workspaceId, {
        fieldKey: suggestion.fieldKey, label: suggestion.label, type: suggestion.type, options: suggestion.options,
      });
      if (res?.error) { setError(res.error); return; }
      onCreated();
    });
  }

  function handleRestart() {
    setSuggestion(null);
    setConversation([]);
    setError(null);
  }

  return (
    <div style={{ background: 'var(--bg-secondary, #f9f9f9)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>🤖 יצירת שדה עם AI</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>סגירה</button>
      </div>

      {conversation.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {conversation.map((turn, i) => (
            <div key={i} style={{
              fontSize: 12.5, padding: '6px 10px', borderRadius: 6, maxWidth: '80%',
              alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
              background: turn.role === 'user' ? '#0a0a0a' : 'var(--bg)',
              color: turn.role === 'user' ? '#fff' : 'var(--text)',
              border: turn.role === 'user' ? 'none' : '1px solid var(--border)',
            }}>
              {turn.text}
            </div>
          ))}
        </div>
      )}

      {!suggestion && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="לדוגמה: תעשה לי שדה שמחשב כמה אחוז מהתרומה כבר שולם"
            autoFocus
            disabled={isPending}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 }}
          />
          <button type="button" onClick={handleSend} disabled={isPending || !input.trim()}
            style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 12.5, cursor: 'pointer' }}>
            {isPending ? 'חושב...' : 'שליחה'}
          </button>
        </div>
      )}

      {suggestion && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}>
            <b>{suggestion.label}</b> <span style={{ color: 'var(--text-muted)' }}>({TYPE_LABELS[suggestion.type] || suggestion.type})</span>
          </div>
          {suggestion.explanation && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{suggestion.explanation}</div>}
          {suggestion.type === 'computed' && (
            <code style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{suggestion.options?.expression}</code>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleConfirm} disabled={isPending}
              style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              {isPending ? 'יוצר...' : '✓ יצירה'}
            </button>
            <button type="button" onClick={handleRestart} disabled={isPending}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              התחלה מחדש
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
