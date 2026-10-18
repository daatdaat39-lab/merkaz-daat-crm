'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SEVERITY_LABELS, STATUS_LABELS, slaStatus } from '../../lib/serviceSla';
import { updateCaseStatus, assignCaseAgent } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '5px 8px', fontSize: 12 };
const COL_COUNT = 7;

// שורת-קריאה בטבלה (כיוון 🅰 מהסקיצה - נבחר במקום הכרטיסים), אותו
// עיקרון כמו LeadTableRow.js: שורה ראשית עם העמודות + שורה שנייה
// (colSpan מלא) לצ'יפ-ה-AI.
export default function CaseTableRow({ c, agents }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const sla = c.status === 'closed' ? null : slaStatus(c.slaDueAt, c.severity);

  function handleStatusChange(e) {
    startTransition(async () => { await updateCaseStatus(c.id, e.target.value); router.refresh(); });
  }
  function handleAgentChange(e) {
    startTransition(async () => { await assignCaseAgent(c.id, e.target.value || null); router.refresh(); });
  }

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>#{c.caseNumber}</td>
        <td style={{ padding: '10px 12px' }}>
          <Link href={`/dashboard/service/cases/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
            {c.contactName}
          </Link>
          {c.contactPhone && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.contactPhone}</div>}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <Link href={`/dashboard/service/cases/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{c.subject}</Link>
          {c.courseName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.courseName}</div>}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            {SEVERITY_LABELS[c.severity] || c.severity}
          </span>
        </td>
        <td style={{ padding: '10px 12px' }}>
          {sla ? (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100, background: sla.bg, color: sla.color }}>{sla.label}</span>
          ) : '—'}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <select value={c.status} onChange={handleStatusChange} disabled={isPending} style={inputStyle}>
            {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <select value={c.assignedTo || ''} onChange={handleAgentChange} disabled={isPending} style={inputStyle}>
            <option value="">ללא נציג</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </td>
      </tr>
      <tr style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
        <td></td>
        <td colSpan={COL_COUNT - 1} style={{ padding: '0 12px 10px' }}>
          {c.aiActionSummary ? (
            <div style={{ background: 'var(--purple-bg, #f5f3ff)', border: '1px solid var(--purple, #7c3aed)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, display: 'flex', gap: 6 }}>
              <span>💡</span><span>{c.aiActionSummary}</span>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              אין עדיין המלצת AI - לחץ/י "רענון המלצות" למעלה
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
