'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { approveAndAssignLead } from '../../contacts/actions';

// טבלת הלידים הממתינים - לכל שורה בחירת נציג + "אשר ושגר". אחרי אישור
// השורה נעלמת מהתיבה ומופיעה אצל הנציג ברשימת הלידים הרגילה.
export default function PendingLeadsClient({ initialPending, agents = [] }) {
  const [pending, setPending] = useState(initialPending);
  const [assignments, setAssignments] = useState({});
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove(departmentRowId) {
    setError(null);
    startTransition(async () => {
      const res = await approveAndAssignLead(departmentRowId, assignments[departmentRowId] || null);
      if (res?.error) { setError(res.error); return; }
      setPending((prev) => prev.filter((p) => p.departmentRowId !== departmentRowId));
      router.refresh();
    });
  }

  if (pending.length === 0) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 14, color: '#15803d' }}>
        🎉 אין לידים שממתינים לאישור
      </div>
    );
  }

  return (
    <div>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>שגיאה: {error}</div>}
      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              {['שם', 'טלפון', 'מייל', 'מקור', 'מהות הפנייה', 'נציג מטפל', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted, #9b9b9b)', padding: '10px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.departmentRowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '10px 14px' }}>
                  <Link href={`/dashboard/contacts/${p.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                    {p.name || '—'}
                  </Link>
                  <div style={{ fontSize: 11, color: '#9b9b9b' }}>
                    התקבל {new Date(p.createdAt).toLocaleDateString('he-IL')}
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>{p.phone || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{p.email || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{p.inquirySource || p.source || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{p.latestReason || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <select
                    value={assignments[p.departmentRowId] || ''}
                    onChange={(e) => setAssignments((a) => ({ ...a, [p.departmentRowId]: e.target.value }))}
                    disabled={isPending}
                    style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}
                  >
                    <option value="">— ללא נציג —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button
                    type="button"
                    onClick={() => handleApprove(p.departmentRowId)}
                    disabled={isPending}
                    style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ✓ אשר ושגר
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
