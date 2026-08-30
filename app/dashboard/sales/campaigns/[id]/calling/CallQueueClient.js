'use client';

import { useEffect, useState, useTransition } from 'react';
import { getCallableCampaignSummary, listCategoryContactsForCalling, claimNextContact } from '../callQueueActions';
import ActiveCallPanel from './ActiveCallPanel';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };
const cardStyle = { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 };

// טבלה רגילה לעיון + כפתור "התקשר לבא בתור" שפותח מודאל ממוקד לשיחה
// עצמה - לא כרטיס-יחיד למסך כולו (יש תקדים מפורש ב-MappingQueue.js
// שהוחלף בטבלה לפי בקשת המשתמש - טבלה נשארת ברירת-המחדל לעיון/פיקוח).
// isLockedTelemarketer: תפקיד "טלפן" הנעול מקבל חוויה שונה לגמרי - בלי
// טבלה בכלל (גם לא נשלפת), לולאת-שיחות רצופה אמיתית במקום מסך-ביניים.
export default function CallQueueClient({ campaignId, stages, workspaceId, whatsappTemplates = [], isLockedTelemarketer = false }) {
  const [summary, setSummary] = useState(null);
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [emptyMessage, setEmptyMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function loadSummary() {
    getCallableCampaignSummary(campaignId).then((res) => {
      if (res.error) { setError(res.error); return; }
      setSummary(res);
    });
  }

  function loadRows(cat) {
    listCategoryContactsForCalling(campaignId, cat || null).then((res) => {
      if (res.success) setRows(res.rows);
    });
  }

  useEffect(() => { loadSummary(); }, [campaignId]);
  useEffect(() => {
    if (!isLockedTelemarketer) loadRows(category);
  }, [campaignId, category, isLockedTelemarketer]);

  function handleCallNext() {
    setError('');
    setEmptyMessage('');
    startTransition(async () => {
      const res = await claimNextContact(campaignId, category || null);
      if (res.error) { setError(res.error); return; }
      if (!res.contact) { setEmptyMessage('אין יותר אנשי קשר בקטגוריה הזו כרגע - נסו קטגוריה אחרת.'); return; }
      setActiveContact(res.contact);
    });
  }

  function handlePanelClosed({ autoAdvance } = {}) {
    setActiveContact(null);
    loadSummary();
    if (!isLockedTelemarketer) loadRows(category);
    if (isLockedTelemarketer || autoAdvance) handleCallNext();
  }

  if (isLockedTelemarketer) {
    return (
      <div>
        {error && (
          <div style={{ marginBottom: 14, background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#c62828' }}>
            {error}
          </div>
        )}

        {!activeContact && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '50px 20px', textAlign: 'center' }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, fontSize: 14 }}>
              <option value="">הכל</option>
              {(summary?.categories || []).map((c) => (
                <option key={c} value={c}>{c} ({summary?.countByCategory?.[c] || 0})</option>
              ))}
            </select>
            <button
              type="button" onClick={handleCallNext} disabled={isPending}
              style={{ ...inputStyle, fontSize: 16, fontWeight: 700, padding: '14px 32px', background: 'var(--accent, #2f6f4f)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}
            >
              🚀 התחל שיחות
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {summary ? `${summary.total} אנשי קשר ממתינים לשיחה` : 'טוען...'}
            </span>
            {emptyMessage && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{emptyMessage}</div>}
          </div>
        )}

        {activeContact && (
          <ActiveCallPanel
            contact={activeContact} stages={stages} workspaceId={workspaceId} whatsappTemplates={whatsappTemplates}
            hideAutoAdvanceToggle onClose={handlePanelClosed}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 14, background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#c62828' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          <option value="">הכל</option>
          {(summary?.categories || []).map((c) => (
            <option key={c} value={c}>{c} ({summary?.countByCategory?.[c] || 0})</option>
          ))}
        </select>
        <button
          type="button" onClick={handleCallNext} disabled={isPending || !!activeContact}
          style={{ ...inputStyle, background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, cursor: 'pointer', border: 'none' }}
        >
          📞 התקשר לבא בתור
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {summary ? `${summary.total} אנשי קשר ממתינים לשיחה` : 'טוען...'}
        </span>
      </div>

      {emptyMessage && (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>{emptyMessage}</div>
      )}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary, #f7f7f7)', textAlign: 'right' }}>
                <th style={{ padding: '8px 12px' }}>שם</th>
                <th style={{ padding: '8px 12px' }}>טלפון</th>
                <th style={{ padding: '8px 12px' }}>סטטוס</th>
                <th style={{ padding: '8px 12px' }}>נתפס ע"י</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowId} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ padding: '8px 12px' }}>{r.name}</td>
                  <td style={{ padding: '8px 12px' }}>{r.phone}</td>
                  <td style={{ padding: '8px 12px' }}>{stages.find((s) => s.stageKey === r.status)?.label || r.status}</td>
                  <td style={{ padding: '8px 12px', color: r.claimedByName ? '#b26a00' : 'var(--text-muted)' }}>
                    {r.claimedByName || '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>אין שורות להצגה</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeContact && (
        <ActiveCallPanel
          contact={activeContact} stages={stages} workspaceId={workspaceId} whatsappTemplates={whatsappTemplates}
          onClose={handlePanelClosed}
        />
      )}
    </div>
  );
}
