'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import QuickActivityLogForm from './QuickActivityLogForm';
import NewInquiryForm from './NewInquiryForm';
import { useFloatingWindows } from '../../components/FloatingWindows';
import { createCase } from '../../service/cases/actions';
import { SEVERITY_LABELS } from '../../lib/serviceSla';

const btnStyle = {
  background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '7px 16px',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--k-text, inherit)',
};
const inputStyle = { border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, background: 'var(--k-surface, var(--bg))', color: 'var(--k-text, inherit)' };

// מאחד-לכפתור-"+"-אחד את כל-פעולות-היצירה-החדשה (לא-יצירת-קשר-מיידי -
// חייג/וואטסאפ/מייל נשארים-נפרדים, ר' דיון). "סיכום חופשי"/"פנייה
// מסודרת" לא-השתנו-בלוגיקה (QuickActivityLogForm/NewInquiryForm), רק-
// נבחרות-מתוך-התפריט. "משימה/פגישה" ו"קריאת-שירות-חדשה" נוספו-כאן
// (שימוש-חוזר ב-openWindow/createCase הקיימים, לא-לוגיקה-חדשה).
// "+ פתח-ליד-נוסף-לקורס-אחר" יתווסף-לתפריט-הזה-בעתיד, אחרי-שמיגרציית-
// "ליד-פר-קורס" תרוץ.
export default function QuickActionLauncher({ contactId, department, stages, labels, workspaceId, workspaceName, frozen }) {
  const [mode, setMode] = useState(null); // null | 'choosing' | 'summary' | 'inquiry' | 'case'
  const [caseSubject, setCaseSubject] = useState('');
  const [caseSeverity, setCaseSeverity] = useState('medium');
  const [caseError, setCaseError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const { openWindow } = useFloatingWindows();
  const router = useRouter();

  if (frozen) return null;

  if (mode === 'summary') {
    return <QuickActivityLogForm contactId={contactId} department={department} stages={stages} labels={labels} forceOpen onDone={() => setMode(null)} />;
  }
  if (mode === 'inquiry') {
    return <NewInquiryForm contactId={contactId} workspaceId={workspaceId} workspaceName={workspaceName} forceOpen onDone={() => setMode(null)} />;
  }

  function handleCreateCase() {
    setCaseError(null);
    if (!caseSubject.trim()) { setCaseError('יש למלא נושא לקריאה'); return; }
    startTransition(async () => {
      const res = await createCase({ contactId, workspaceId, courseId: department?.extraFields?.course_id || null, subject: caseSubject, severity: caseSeverity });
      if (res?.error) { setCaseError(res.error); return; }
      router.push(`/dashboard/service/cases/${res.caseId}`);
    });
  }

  if (mode === 'case') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: 12 }}>
        <input
          value={caseSubject}
          onChange={(e) => setCaseSubject(e.target.value)}
          placeholder="נושא הקריאה..."
          autoFocus
          style={inputStyle}
        />
        <select value={caseSeverity} onChange={(e) => setCaseSeverity(e.target.value)} style={inputStyle}>
          {Object.entries(SEVERITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {caseError && <div style={{ fontSize: 11.5, color: 'var(--k-danger-text, #b23b2f)' }}>{caseError}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleCreateCase} disabled={isPending} style={{ ...btnStyle, flex: 1, background: 'var(--k-accent)', color: '#fff', borderColor: 'var(--k-accent)' }}>
            {isPending ? 'יוצר...' : 'יצירת קריאה'}
          </button>
          <button type="button" onClick={() => setMode(null)} style={{ ...btnStyle, flex: 1 }}>ביטול</button>
        </div>
      </div>
    );
  }

  if (mode === 'choosing') {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setMode('summary')} style={btnStyle}>📝 סיכום חופשי</button>
        <button type="button" onClick={() => setMode('inquiry')} style={btnStyle}>📩 פנייה מסודרת</button>
        <button
          type="button"
          onClick={() => { setMode(null); openWindow({ id: 'calendar', kind: 'calendar', title: 'יומן', props: { initialContactId: contactId, autoOpenToday: true } }); }}
          style={btnStyle}
        >
          📅 משימה/פגישה
        </button>
        <button type="button" onClick={() => setMode('case')} style={btnStyle}>🛟 קריאת שירות חדשה</button>
        <button type="button" onClick={() => setMode(null)} style={{ background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--k-text-muted, #9b9b9b)' }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setMode('choosing')} style={{ ...btnStyle, marginBottom: 16 }}>
      + פעולה חדשה
    </button>
  );
}
