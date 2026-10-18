'use client';

import { useState } from 'react';

// ציר-זמן מאוחד אמיתי (לא כמו טאב "פעילות" הקיים ב-ContactTabs.js, שהוא 7
// רשימות נפרדות-לפי-סוג, כל אחת ממוינת בנפרד) - שלב 2 ממודול מכירות/שירות.
// מיזוג-מיון בצד-הלקוח של אותן 7 מערכים בדיוק שכבר נטענים ב-
// loadContactCardData.js (לא RPC/view חדש - פחות סיכון, שאילתות קיימות
// בלי שינוי). רכיב חדש ועצמאי - לא נוגע בטאב "פעילות" הקיים, כדי לא
// לסכן התנהגות-חיה. מיועד למסך-המכירות (שלב 3) ולמסך-השירות (שלב 4).
//
// שלב 1 מתוכנית-העיצוב-מחדש: כל פריט מציג כברירת-מחדל רק שורה מתומצתת
// (קיצור דטרמיניסטי של הטקסט כאן - לא AI עדיין), עם "הצג פרטים מלאים"
// לפתיחה. זו הכנה מכוונת למבנה שישמש גם את שלב 2 (האי-איי) - רק
// מקור-הטקסט-המתומצת יוחלף מקיצור לסיכום-AI אמיתי, בלי לגעת שוב במבנה.

const TYPE_META = {
  inquiry: { icon: '📋', color: '#b45309' },
  email: { icon: '✉️', color: '#1d4ed8' },
  whatsapp: { icon: '💬', color: '#15803d' },
  donation: { icon: '💰', color: '#15803d' },
  call_history: { icon: '📞', color: '#6b7280' },
  phone_call: { icon: '☎️', color: '#7c3aed' },
  meeting: { icon: '📅', color: '#c2410c' },
};

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

function truncate(text, max = 60) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function DeptTag({ name }) {
  if (!name) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 4, padding: '1px 6px', marginInlineEnd: 6 }}>
      {name}
    </span>
  );
}

// ממזג את 7 המערכים לרשימה אחת ממוינת-כרונולוגית. כל פריט מחזיק גם
// summary (תמיד קצר) וגם full (התוכן המלא) - hasMore מציין אם יש בכלל
// מה להרחיב (לא כל פריט - למשל "נשלח מייל" כבר קצר כברירת-מחדל).
function buildTimelineItems({ inquiries = [], sentEmails = [], sentWhatsapp = [], donationTransactions = [], callHistory = [], phoneCalls = [], meetings = [], workspaceNameById = {} }) {
  const items = [];

  for (const inq of inquiries) {
    items.push({
      type: 'inquiry', occurredAt: inq.created_at,
      summary: (<><DeptTag name={inq.workspaceName} /><span>{inq.reason}</span></>),
      full: (<><DeptTag name={inq.workspaceName} /><span>{inq.reason}</span>{inq.note && <span style={{ color: 'var(--text-secondary)' }}> — {inq.note}</span>}</>),
      hasMore: Boolean(inq.note),
    });
  }
  for (const e of sentEmails) {
    items.push({
      type: 'email', occurredAt: e.sent_at,
      summary: (<><DeptTag name={workspaceNameById[e.workspace_id]} /><span style={{ fontWeight: 500 }}>{truncate(e.subject, 50)}</span></>),
      full: (<><DeptTag name={workspaceNameById[e.workspace_id]} /><span style={{ fontWeight: 500 }}>{e.subject}</span><span style={{ color: 'var(--text-secondary)' }}> · מאת {e.from_address}</span></>),
      hasMore: Boolean(e.from_address) || (e.subject || '').length > 50,
    });
  }
  for (const w of sentWhatsapp) {
    const fullText = w.kind === 'chat' ? w.message : `הודעת תבנית${w.reason ? ` — ${w.reason}` : ''}`;
    const prefix = w.direction === 'in' ? '⬅️ מהלקוח: ' : '➡️ נשלח: ';
    items.push({
      type: 'whatsapp', occurredAt: w.sent_at,
      summary: (<><DeptTag name={workspaceNameById[w.workspace_id]} /><span style={{ fontWeight: 500 }}>{prefix}{truncate(fullText, 50)}</span></>),
      full: (<><DeptTag name={workspaceNameById[w.workspace_id]} /><span style={{ fontWeight: 500 }}>{prefix}{fullText}</span></>),
      hasMore: (fullText || '').length > 50,
    });
  }
  for (const t of donationTransactions) {
    const base = (<><DeptTag name={workspaceNameById[t.workspace_id]} /><span style={{ fontWeight: 600, color: '#15803d' }}>₪{Number(t.amount).toLocaleString('he-IL')}</span>{t.source_system && <span style={{ color: 'var(--text-secondary)' }}> · {t.source_system}</span>}</>);
    items.push({
      type: 'donation', occurredAt: t.transaction_date,
      summary: base,
      full: (<>{base}{t.receipt_url && <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" style={{ marginInlineStart: 8, color: 'var(--accent, #1f4d3d)' }}>📄 קבלה</a>}</>),
      hasMore: Boolean(t.receipt_url),
    });
  }
  for (const c of callHistory) {
    items.push({
      type: 'call_history', occurredAt: c.call_date,
      summary: (<span style={{ fontWeight: 600 }}>{truncate(c.response_text, 60) || 'שיחה'}</span>),
      full: (<><span style={{ fontWeight: 600 }}>{c.response_text || 'שיחה'}</span>{c.source_system && <span style={{ color: 'var(--text-secondary)' }}> · {c.source_system}</span>}</>),
      hasMore: (c.response_text || '').length > 60 || Boolean(c.source_system),
    });
  }
  for (const c of phoneCalls) {
    items.push({
      type: 'phone_call', occurredAt: c.started_at,
      summary: (<><span style={{ fontWeight: 600 }}>{c.direction === 'outbound' ? 'יוצאת' : 'נכנסת'}</span><span> · {c.answered ? 'נענתה' : 'לא נענתה'}</span>{c.duration_seconds ? <span style={{ color: 'var(--text-secondary)' }}> · {Math.round(c.duration_seconds / 60)} דק'</span> : null}</>),
      full: (<><span style={{ fontWeight: 600 }}>{c.direction === 'outbound' ? 'יוצאת' : 'נכנסת'}</span><span> · {c.answered ? 'נענתה' : 'לא נענתה'}</span>{c.duration_seconds ? <span style={{ color: 'var(--text-secondary)' }}> · {Math.round(c.duration_seconds / 60)} דק'</span> : null}{c.recording_url && <div style={{ marginTop: 6 }}><audio controls src={c.recording_url} style={{ height: 32, maxWidth: '100%' }} /></div>}</>),
      hasMore: Boolean(c.recording_url),
    });
  }
  for (const m of meetings) {
    items.push({
      type: 'meeting', occurredAt: `${m.meeting_date}T${m.meeting_time || '00:00'}`,
      summary: (<><DeptTag name={workspaceNameById[m.workspace_id]} /><span style={{ fontWeight: 500 }}>{m.title || 'פגישה'}</span>{m.location ? <span style={{ color: 'var(--text-secondary)' }}> · {m.location}</span> : null}</>),
      full: (<><DeptTag name={workspaceNameById[m.workspace_id]} /><span style={{ fontWeight: 500 }}>{m.title || 'פגישה'}</span>{m.location ? <span style={{ color: 'var(--text-secondary)' }}> · {m.location}</span> : null}{m.notes && <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{m.notes}</div>}</>),
      hasMore: Boolean(m.notes),
    });
  }

  return items
    .filter((it) => it.occurredAt)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

function TimelineRow({ item, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[item.type] || { icon: '•', color: 'var(--text-secondary)' };
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: isLast ? 'none' : '1px solid var(--border, #f0f0f0)' }}>
      <div style={{ flex: 'none', width: 22, textAlign: 'center', fontSize: 13 }} aria-hidden="true">{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.6 }}>
        <div>{expanded ? item.full : item.summary}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)' }}>{fmt(item.occurredAt)}</span>
          {item.hasMore && (
            <button
              type="button" onClick={() => setExpanded((v) => !v)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 10.5, color: 'var(--accent, #2f6f4f)', cursor: 'pointer' }}
            >
              {expanded ? 'הסתר' : 'הצג פרטים מלאים'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnifiedTimeline(props) {
  const items = buildTimelineItems(props);

  if (items.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '12px 0' }}>אין עדיין פעילות מתועדת.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((it, i) => (
        <TimelineRow key={i} item={it} isLast={i === items.length - 1} />
      ))}
    </div>
  );
}
