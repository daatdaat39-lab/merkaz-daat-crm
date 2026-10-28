'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SEVERITY_LABELS, STATUS_LABELS, slaStatus } from '../../lib/serviceSla';
import { updateCaseStatus, assignCaseAgent } from './actions';
import { PhoneIcon, PersonIcon, SparkleIcon } from '../../components/icons';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 8px', fontSize: 12, background: 'var(--k-surface)', color: 'var(--k-text)' };
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
      <tr style={{ borderBottom: '1px solid var(--k-border)' }}>
        <td style={{ padding: '10px 12px', color: 'var(--k-text-muted)', fontVariantNumeric: 'tabular-nums' }}>#{c.caseNumber}</td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link href={`/dashboard/contacts/${c.contactId}`} style={{ textDecoration: 'none', fontFamily: 'var(--k-font-display)', fontSize: 14, color: 'var(--k-text)' }}>
              {c.contactName}
            </Link>
            <Link
              href={`/dashboard/service/cases/${c.id}`} title="התקשרות - פותח את מסך-הטיפול"
              style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700, fontSize: 10.5, background: 'var(--k-accent)', color: '#fff', borderRadius: 8, padding: '3px 9px', textDecoration: 'none' }}
            >
              <PhoneIcon size={10} />
            </Link>
          </div>
          {c.contactPhone && <div style={{ fontSize: 11, color: 'var(--k-text-muted)' }}>{c.contactPhone}</div>}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <Link href={`/dashboard/service/cases/${c.id}`} style={{ textDecoration: 'none', color: 'var(--k-text)' }}>{c.subject}</Link>
          {c.courseName && <div style={{ fontSize: 11, color: 'var(--k-text-muted)' }}>{c.courseName}</div>}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100, background: 'var(--k-pill-bg)', color: 'var(--k-pill-text)' }}>
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
      <tr style={{ borderBottom: '1px solid var(--k-border)' }}>
        <td></td>
        <td colSpan={COL_COUNT - 1} style={{ padding: '0 12px 10px' }}>
          {c.aiActionSummary ? (
            <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderInlineEnd: '3px solid var(--k-accent)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, display: 'flex', gap: 6, color: 'var(--k-text)' }}>
              <SparkleIcon size={13} style={{ color: 'var(--k-accent)' }} /><span>{c.aiActionSummary}</span>
            </div>
          ) : (
            <div style={{ background: 'var(--k-pill-bg)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: 'var(--k-text-muted)', fontStyle: 'italic' }}>
              אין עדיין המלצת AI - לחץ/י "רענון המלצות" למעלה
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
