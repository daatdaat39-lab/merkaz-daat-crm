'use client';

const card = { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px' };
const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '24px 0 10px' };

export default function CallDashboardClient({ stats }) {
  const { totals, agentTable, notes } = stats;

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
        <div style={{ ...card, flex: '1 1 160px' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.remainingInQueue}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>נותרים בתור</div>
        </div>
      </div>

      <div style={sectionLabel}>לפי נציג</div>
      {agentTable.length === 0 && <div style={{ ...card, color: 'var(--text-muted)', fontSize: 12.5 }}>אין עדיין שיחות רשומות.</div>}
      {agentTable.length > 0 && (
        <div style={{ ...card, overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary, #f7f7f7)', textAlign: 'right' }}>
                <th style={{ padding: '8px 12px' }}>נציג</th>
                <th style={{ padding: '8px 12px' }}>סה"כ שיחות</th>
                <th style={{ padding: '8px 12px' }}>פילוח תוצאות</th>
              </tr>
            </thead>
            <tbody>
              {agentTable.map((a) => (
                <tr key={a.agentName} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.agentName}</td>
                  <td style={{ padding: '8px 12px' }}>{a.total}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {a.outcomeBreakdown.map((o) => (
                        <span key={o.outcome} style={{ fontSize: 11, background: 'var(--bg-secondary, #f0f0f0)', borderRadius: 999, padding: '2px 8px' }}>
                          {o.label}: {o.count} ({o.pct}%)
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
