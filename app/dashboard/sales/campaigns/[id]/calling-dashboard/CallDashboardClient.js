'use client';

import { useState } from 'react';
import Link from 'next/link';
import { listCallAttemptsByAgentOutcome, listRemainingInQueueContacts } from '../callDashboardActions';

const card = { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px' };
const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '24px 0 10px' };

// רשימת drill-down משותפת - אותו דפוס בדיוק כמו הקטע המתקפל ב-
// CallQueueClient.js ("ביקשו ממני לחזור אליהם"): מסגרת מעוגלת, כל שורה
// button נפרד עם קו-מפריד, לינק לכרטיס איש-הקשר.
function DrillDownList({ loading, items }) {
  if (loading) return <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>טוען...</div>;
  if (!items || items.length === 0) return <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>אין תוצאות</div>;
  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
      {items.map((it, i) => (
        <Link
          key={it.contactId || it.rowId || i}
          href={it.contactId ? `/dashboard/contacts/${it.contactId}` : '#'}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right',
            padding: '8px 12px', textDecoration: 'none', color: 'inherit',
            borderBottom: i < items.length - 1 ? '1px solid var(--border, #f0f0f0)' : 'none', background: 'var(--bg)',
          }}
        >
          <span>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{it.name || '—'}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}> · {it.phone || '—'}</span>
            {it.category && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {it.category}</span>}
          </span>
          {it.createdAt && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{it.createdAt}</span>}
        </Link>
      ))}
    </div>
  );
}

export default function CallDashboardClient({ campaignId, stats, donationsByAgent = [], donationsNotReachedOut = [] }) {
  const { totals, agentTable, notes, pendingCallbacks = [], hoursByAgent = [], currentlyClaimed = [] } = stats;

  const [openOutcome, setOpenOutcome] = useState(null); // `${agentId||''}:${outcome}`
  const [outcomeItems, setOutcomeItems] = useState({});
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [remainingItems, setRemainingItems] = useState(null);
  const [remainingLoading, setRemainingLoading] = useState(false);

  function toggleOutcome(agentId, outcome) {
    const key = `${agentId || ''}:${outcome}`;
    if (openOutcome === key) { setOpenOutcome(null); return; }
    setOpenOutcome(key);
    if (!outcomeItems[key]) {
      setOutcomeLoading(true);
      listCallAttemptsByAgentOutcome(campaignId, agentId || null, outcome).then((res) => {
        setOutcomeLoading(false);
        if (!res?.error) setOutcomeItems((prev) => ({ ...prev, [key]: res.items }));
      });
    }
  }

  function toggleRemaining() {
    setShowRemaining((v) => !v);
    if (!remainingItems) {
      setRemainingLoading(true);
      listRemainingInQueueContacts(campaignId).then((res) => {
        setRemainingLoading(false);
        if (!res?.error) setRemainingItems(res.items);
      });
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...card, flex: '1 1 160px' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.totalAttempts}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>סה"כ שיחות שבוצעו</div>
        </div>
        <div style={{ ...card, flex: '1 1 160px' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.uniqueContactsAttempted}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>אנשי קשר ייחודיים שנוסו</div>
        </div>
        <button
          type="button" onClick={toggleRemaining}
          style={{ ...card, flex: '1 1 160px', cursor: 'pointer', textAlign: 'right', border: showRemaining ? '1px solid var(--accent, #2f6f4f)' : card.border }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.remainingInQueue}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>נותרים בתור {showRemaining ? '▴' : '▾'}</div>
        </button>
      </div>
      {showRemaining && (
        <div style={{ marginTop: 10 }}>
          <DrillDownList loading={remainingLoading} items={remainingItems} />
        </div>
      )}

      {currentlyClaimed.length > 0 && (
        <>
          <div style={sectionLabel}>תפוסים כרגע</div>
          <div style={{ ...card, overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #f7f7f7)', textAlign: 'right' }}>
                  <th style={{ padding: '8px 12px' }}>נציג</th>
                  <th style={{ padding: '8px 12px' }}>איש קשר</th>
                  <th style={{ padding: '8px 12px' }}>טלפון</th>
                  <th style={{ padding: '8px 12px' }}>נתפס מתי</th>
                </tr>
              </thead>
              <tbody>
                {currentlyClaimed.map((c) => (
                  <tr key={c.rowId} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.agentName}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Link href={`/dashboard/contacts/${c.contactId}`} style={{ color: 'inherit' }}>{c.name || '—'}</Link>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{c.phone}</td>
                    <td style={{ padding: '8px 12px' }}>{c.claimedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={sectionLabel}>לפי נציג</div>
      {agentTable.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין עדיין שיחות רשומות.</div>}
      {agentTable.length > 0 && (
        <div style={{ ...card, overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary, #f7f7f7)', textAlign: 'right' }}>
                <th style={{ padding: '8px 12px' }}>נציג</th>
                <th style={{ padding: '8px 12px' }}>סה"כ שיחות</th>
                <th style={{ padding: '8px 12px' }}>פילוח תוצאות (לחיצה לפירוט)</th>
              </tr>
            </thead>
            <tbody>
              {agentTable.map((a) => (
                <tr key={a.agentName} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, verticalAlign: 'top' }}>{a.agentName}</td>
                  <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>{a.total}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {a.outcomeBreakdown.map((o) => {
                        const key = `${a.agentId || ''}:${o.outcome}`;
                        const open = openOutcome === key;
                        return (
                          <button
                            key={o.outcome} type="button" onClick={() => toggleOutcome(a.agentId, o.outcome)}
                            style={{
                              fontSize: 11, borderRadius: 999, padding: '2px 8px', cursor: 'pointer', border: 'none',
                              background: open ? 'var(--accent, #2f6f4f)' : 'var(--bg-secondary, #f0f0f0)', color: open ? '#fff' : 'inherit',
                            }}
                          >
                            {o.label}: {o.count} ({o.pct}%)
                          </button>
                        );
                      })}
                    </div>
                    {a.outcomeBreakdown.some((o) => openOutcome === `${a.agentId || ''}:${o.outcome}`) && (
                      <DrillDownList loading={outcomeLoading} items={outcomeItems[openOutcome]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={sectionLabel}>תרמו - פנינו אליהם</div>
      {donationsByAgent.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין עדיין תרומות של מי שדיברנו איתו.</div>}
      {donationsByAgent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {donationsByAgent.map((g) => (
            <div key={g.agentName} style={card}>
              <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>{g.agentName} · {g.items.length}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {g.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>
                      <Link href={`/dashboard/contacts/${it.contactId}`} style={{ color: 'inherit', fontWeight: 600 }}>{it.name || '—'}</Link>
                      {it.amount != null && <span> · ₪{Math.round(it.amount).toLocaleString()}</span>}
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {it.source}</span>
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{it.occurredAt}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={sectionLabel}>תרמו - לא פנינו אליהם</div>
      {donationsNotReachedOut.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין תרומות כאלה כרגע.</div>}
      {donationsNotReachedOut.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {donationsNotReachedOut.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>
                  <Link href={`/dashboard/contacts/${it.contactId}`} style={{ color: 'inherit', fontWeight: 600 }}>{it.name || '—'}</Link>
                  {it.amount != null && <span> · ₪{Math.round(it.amount).toLocaleString()}</span>}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{it.occurredAt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={sectionLabel}>שיחות חזרה ממתינות</div>
      {pendingCallbacks.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין כרגע שיחות-חזרה ממתינות.</div>}
      {pendingCallbacks.length > 0 && (
        <div style={{ ...card, overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary, #f7f7f7)', textAlign: 'right' }}>
                <th style={{ padding: '8px 12px' }}>שם</th>
                <th style={{ padding: '8px 12px' }}>טלפון</th>
                <th style={{ padding: '8px 12px' }}>מתי לחזור</th>
                <th style={{ padding: '8px 12px' }}>מי קבע</th>
              </tr>
            </thead>
            <tbody>
              {pendingCallbacks.map((c) => (
                <tr key={c.rowId} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.name || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{c.phone}</td>
                  <td style={{ padding: '8px 12px' }}>{c.callbackAt}</td>
                  <td style={{ padding: '8px 12px' }}>{c.scheduledBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={sectionLabel}>שעות עבודה לפי נציג</div>
      {hoursByAgent.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין עדיין נתוני-משמרת.</div>}
      {hoursByAgent.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {hoursByAgent.map((h) => (
            <div key={h.agentName} style={{ ...card, flex: '1 1 140px' }}>
              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{h.agentName}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{Math.floor(h.minutes / 60)}:{String(h.minutes % 60).padStart(2, '0')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.stillActive ? 'פעיל/ה כרגע' : 'שעות'}</div>
            </div>
          ))}
        </div>
      )}

      <div style={sectionLabel}>הערות מיוחדות (50 אחרונות)</div>
      {notes.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין עדיין הערות.</div>}
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={card}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.contactName || 'איש קשר'} · {n.outcomeLabel}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 4px' }}>{n.agentName} · {n.createdAt}</div>
              <div style={{ fontSize: 12.5 }}>{n.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
