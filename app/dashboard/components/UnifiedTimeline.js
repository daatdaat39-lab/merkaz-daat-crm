'use client';

// ציר-זמן מאוחד אמיתי (לא כמו טאב "פעילות" הקיים ב-ContactTabs.js, שהוא 7
// רשימות נפרדות-לפי-סוג, כל אחת ממוינת בנפרד) - שלב 2 ממודול מכירות/שירות.
// מיזוג-מיון בצד-הלקוח של אותן 7 מערכים בדיוק שכבר נטענים ב-
// loadContactCardData.js (לא RPC/view חדש - פחות סיכון, שאילתות קיימות
// בלי שינוי). רכיב חדש ועצמאי - לא נוגע בטאב "פעילות" הקיים, כדי לא
// לסכן התנהגות-חיה. מיועד למסך-המכירות (שלב 3) ולמסך-השירות (שלב 4).

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

function DeptTag({ name }) {
  if (!name) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 4, padding: '1px 6px', marginInlineEnd: 6 }}>
      {name}
    </span>
  );
}

// ממזג את 7 המערכים לרשימה אחת ממוינת-כרונולוגית, עם {type, occurredAt, node}
// לכל פריט - אותה צורת-props בדיוק כמו loadContactCardData.js מחזיר, כדי
// שהמסכים החדשים יוכלו להעביר את אותם props ישירות בלי טרנספורמציה נוספת.
function buildTimelineItems({ inquiries = [], sentEmails = [], sentWhatsapp = [], donationTransactions = [], callHistory = [], phoneCalls = [], meetings = [], workspaceNameById = {} }) {
  const items = [];

  for (const inq of inquiries) {
    items.push({
      type: 'inquiry', occurredAt: inq.created_at,
      node: (
        <>
          <DeptTag name={inq.workspaceName} />
          <span>{inq.reason}</span>
          {inq.note && <span style={{ color: 'var(--text-secondary)' }}> — {inq.note}</span>}
        </>
      ),
    });
  }
  for (const e of sentEmails) {
    items.push({
      type: 'email', occurredAt: e.sent_at,
      node: (
        <>
          <DeptTag name={workspaceNameById[e.workspace_id]} />
          <span style={{ fontWeight: 500 }}>{e.subject}</span>
          <span style={{ color: 'var(--text-secondary)' }}> · מאת {e.from_address}</span>
        </>
      ),
    });
  }
  for (const w of sentWhatsapp) {
    items.push({
      type: 'whatsapp', occurredAt: w.sent_at,
      node: (
        <>
          <DeptTag name={workspaceNameById[w.workspace_id]} />
          <span style={{ fontWeight: 500 }}>
            {w.direction === 'in' ? '⬅️ מהלקוח: ' : '➡️ נשלח: '}
            {w.kind === 'chat' ? w.message : `הודעת תבנית${w.reason ? ` — ${w.reason}` : ''}`}
          </span>
        </>
      ),
    });
  }
  for (const t of donationTransactions) {
    items.push({
      type: 'donation', occurredAt: t.transaction_date,
      node: (
        <>
          <DeptTag name={workspaceNameById[t.workspace_id]} />
          <span style={{ fontWeight: 600, color: '#15803d' }}>₪{Number(t.amount).toLocaleString('he-IL')}</span>
          {t.source_system && <span style={{ color: 'var(--text-secondary)' }}> · {t.source_system}</span>}
          {t.receipt_url && (
            <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" style={{ marginInlineStart: 8, color: 'var(--accent, #1f4d3d)' }}>📄 קבלה</a>
          )}
        </>
      ),
    });
  }
  for (const c of callHistory) {
    items.push({
      type: 'call_history', occurredAt: c.call_date,
      node: (
        <>
          <span style={{ fontWeight: 600 }}>{c.response_text || 'שיחה'}</span>
          {c.source_system && <span style={{ color: 'var(--text-secondary)' }}> · {c.source_system}</span>}
        </>
      ),
    });
  }
  for (const c of phoneCalls) {
    items.push({
      type: 'phone_call', occurredAt: c.started_at,
      node: (
        <>
          <span style={{ fontWeight: 600 }}>{c.direction === 'outbound' ? 'יוצאת' : 'נכנסת'}</span>
          <span> · {c.answered ? 'נענתה' : 'לא נענתה'}</span>
          {c.duration_seconds ? <span style={{ color: 'var(--text-secondary)' }}> · {Math.round(c.duration_seconds / 60)} דק'</span> : null}
          {c.recording_url && (
            <div style={{ marginTop: 6 }}><audio controls src={c.recording_url} style={{ height: 32, maxWidth: '100%' }} /></div>
          )}
        </>
      ),
    });
  }
  for (const m of meetings) {
    items.push({
      type: 'meeting', occurredAt: `${m.meeting_date}T${m.meeting_time || '00:00'}`,
      node: (
        <>
          <DeptTag name={workspaceNameById[m.workspace_id]} />
          <span style={{ fontWeight: 500 }}>{m.title || 'פגישה'}</span>
          {m.location ? <span style={{ color: 'var(--text-secondary)' }}> · {m.location}</span> : null}
          {m.notes && <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{m.notes}</div>}
        </>
      ),
    });
  }

  return items
    .filter((it) => it.occurredAt)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

export default function UnifiedTimeline(props) {
  const items = buildTimelineItems(props);

  if (items.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '12px 0' }}>אין עדיין פעילות מתועדת.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((it, i) => {
        const meta = TYPE_META[it.type] || { icon: '•', color: 'var(--text-secondary)' };
        return (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border, #f0f0f0)' : 'none' }}>
            <div style={{ flex: 'none', width: 22, textAlign: 'center', fontSize: 13 }} aria-hidden="true">{meta.icon}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.6 }}>
              <div>{it.node}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)', marginTop: 2 }}>{fmt(it.occurredAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
