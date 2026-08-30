'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { approveContactEditSuggestion, rejectContactEditSuggestion } from '../../lib/contactEditSuggestions';
import { EDITABLE_CONTACT_FIELDS } from '../../lib/editableContactFields';
import { formatIsraeliDateTime } from '../../lib/dateFormat';

const LABEL_BY_KEY = Object.fromEntries(EDITABLE_CONTACT_FIELDS.map((f) => [f.key, f.label]));

export default function ContactCorrectionsClient({ initialSuggestions }) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleApprove(id) {
    setError('');
    startTransition(async () => {
      const res = await approveContactEditSuggestion(id);
      if (res.error) { setError(res.error); return; }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    });
  }

  function handleReject(id) {
    setError('');
    startTransition(async () => {
      const res = await rejectContactEditSuggestion(id);
      if (res.error) { setError(res.error); return; }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    });
  }

  if (suggestions.length === 0) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '16px 20px', fontSize: 13, color: '#166534', textAlign: 'center' }}>
        🎉 אין תיקונים שממתינים לאישור
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#c62828' }}>{error}</div>
      )}
      {suggestions.map((s) => (
        <div key={s.id} style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Link href={`/dashboard/contacts/${s.contactId}`} style={{ fontWeight: 600, fontSize: 14, color: 'inherit', textDecoration: 'none' }}>
              {s.contactName || 'איש קשר'}
            </Link>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.submitterName} · {formatIsraeliDateTime(s.createdAt)}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 12 }}>
            <thead>
              <tr style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>שדה</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>ערך נוכחי</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>ערך מוצע</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.changes).map(([field, newValue]) => (
                <tr key={field} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ padding: '6px 8px' }}>{LABEL_BY_KEY[field] || field}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{s.currentValues?.[field] || '—'}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1f4d3d' }}>{String(newValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button" onClick={() => handleApprove(s.id)} disabled={isPending}
              style={{ background: '#1f4d3d', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}
            >
              ✓ אשר
            </button>
            <button
              type="button" onClick={() => handleReject(s.id)} disabled={isPending}
              style={{ background: 'none', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', color: '#b23b2f' }}
            >
              ✕ דחה
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
