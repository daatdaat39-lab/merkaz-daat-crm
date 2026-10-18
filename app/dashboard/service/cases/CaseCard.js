'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SEVERITY_LABELS, STATUS_LABELS, slaStatus } from '../../lib/serviceSla';
import { card } from '../../components/designTokens';
import { updateCaseStatus, assignCaseAgent } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '5px 8px', fontSize: 12 };

// כרטיס-קריאת-שירות (שלב 1 מתוכנית-העיצוב-מחדש) - אותו עיקרון כמו
// LeadCard.js: תגיות-סטטוס/חומרה תמיד על רקע-נייטרלי רך (לא הצבע-
// המדויק), מחוון-SLA קומפקטי כאן (ה-hero הגדול רק במסך-הקריאה-הבודד).
export default function CaseCard({ c, agents }) {
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
    <div style={card({ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/service/cases/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600, fontSize: 13.5 }}>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginInlineEnd: 6 }}>#{c.caseNumber}</span>
            {c.subject}
          </Link>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {c.contactName}{c.contactPhone ? ` · ${c.contactPhone}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', flexShrink: 0 }}>
          {SEVERITY_LABELS[c.severity] || c.severity}
        </span>
      </div>

      {c.courseName && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.courseName}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {sla ? (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 100, background: sla.bg, color: sla.color }}>{sla.label}</span>
        ) : <span />}
        <select value={c.status} onChange={handleStatusChange} disabled={isPending} style={inputStyle}>
          {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      <select value={c.assignedTo || ''} onChange={handleAgentChange} disabled={isPending} style={inputStyle}>
        <option value="">ללא נציג</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      {/* חריץ-המלצת-AI (שלב 2 ימלא כאן בפועל) */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        💡 המלצת AI תוצג כאן בקרוב
      </div>
    </div>
  );
}
