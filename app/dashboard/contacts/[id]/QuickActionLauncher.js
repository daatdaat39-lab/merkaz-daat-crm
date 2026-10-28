'use client';

import { useState } from 'react';
import QuickActivityLogForm from './QuickActivityLogForm';
import NewInquiryForm from './NewInquiryForm';

// מאחד ויזואלית "סיכום שיחה מהיר" + "פנייה חדשה" לכפתור-פעולה אחד -
// שתי הדרכים-השונות-לתעד-פעילות (טקסט חופשי מול מהות מסודרת) נשארות
// בדיוק כמו שהיו (QuickActivityLogForm/NewInquiryForm לא השתנו בלוגיקה),
// רק נבחרות מתוך תפריט-בחירה-קטן במקום שני כפתורים-תמיד-גלויים.
export default function QuickActionLauncher({ contactId, department, stages, labels, workspaceId, workspaceName, frozen }) {
  const [mode, setMode] = useState(null); // null | 'choosing' | 'summary' | 'inquiry'

  if (frozen) return null;

  if (mode === 'summary') {
    return <QuickActivityLogForm contactId={contactId} department={department} stages={stages} labels={labels} forceOpen onDone={() => setMode(null)} />;
  }
  if (mode === 'inquiry') {
    return <NewInquiryForm contactId={contactId} workspaceId={workspaceId} workspaceName={workspaceName} forceOpen onDone={() => setMode(null)} />;
  }

  if (mode === 'choosing') {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setMode('summary')} style={{
          background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 16px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--k-text, inherit)',
        }}>
          📝 סיכום חופשי
        </button>
        <button type="button" onClick={() => setMode('inquiry')} style={{
          background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 16px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--k-text, inherit)',
        }}>
          📩 פנייה מסודרת
        </button>
        <button type="button" onClick={() => setMode(null)} style={{
          background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--k-text-muted, #9b9b9b)',
        }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setMode('choosing')} style={{
      background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 16px',
      fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 16, color: 'var(--k-text, inherit)',
    }}>
      + תיעוד פעילות
    </button>
  );
}
