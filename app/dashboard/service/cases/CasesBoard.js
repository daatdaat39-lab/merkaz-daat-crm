'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchContacts } from '../../contacts/actions';
import { createCase, updateCaseStatus, assignCaseAgent } from './actions';
import { SEVERITY_LABELS, STATUS_LABELS, slaStatus } from '../../lib/serviceSla';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, boxSizing: 'border-box' };
const btnStyle = { ...inputStyle, cursor: 'pointer' };
const primaryBtn = { ...btnStyle, background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, border: 'none' };

const TABS = [
  { key: 'active', label: 'פתוחות' },
  { key: 'closed', label: 'סגורות' },
  { key: 'all', label: 'הכל' },
];

export default function CasesBoard({ cases, agents, courses, workspaceId }) {
  const [tab, setTab] = useState('active');
  const [showNew, setShowNew] = useState(false);
  const router = useRouter();

  const filtered = cases.filter((c) => {
    if (tab === 'active') return c.status !== 'closed';
    if (tab === 'closed') return c.status === 'closed';
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? '#0a0a0a' : 'var(--bg)', color: tab === t.key ? '#fff' : 'inherit',
              border: '1px solid var(--border, #e5e5e5)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowNew(true)} style={primaryBtn}>+ קריאה חדשה</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין קריאות כאן</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                {['#', 'איש קשר', 'נושא', 'קורס', 'חומרה', 'SLA', 'סטטוס', 'נציג מטפל'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <CaseRow key={c.id} c={c} agents={agents} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewCaseModal workspaceId={workspaceId} courses={courses} onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/dashboard/service/cases/${id}`)} />
      )}
    </div>
  );
}

function CaseRow({ c, agents }) {
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
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{c.courseName || '—'}</td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-tertiary)' }}>
          {SEVERITY_LABELS[c.severity] || c.severity}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        {sla ? (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sla.bg, color: sla.color }}>{sla.label}</span>
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
  );
}

function NewCaseModal({ workspaceId, courses, onClose, onCreated }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [contact, setContact] = useState(null);
  const [subject, setSubject] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSearch(value) {
    setQuery(value);
    setContact(null);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, '00000000-0000-0000-0000-000000000000');
      setResults(res);
    });
  }

  function handleCreate() {
    setError('');
    startTransition(async () => {
      const res = await createCase({ contactId: contact?.id, workspaceId, courseId: courseId || null, subject, severity });
      if (res?.error) { setError(res.error); return; }
      onCreated(res.caseId);
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 14, width: 460, maxWidth: '92vw', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>קריאת שירות חדשה</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>איש קשר</label>
          {contact ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}>
              <span>{contact.first} {contact.last} {contact.phone ? `· ${contact.phone}` : ''}</span>
              <button type="button" onClick={() => { setContact(null); setQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ) : (
            <>
              <input value={query} onChange={(e) => handleSearch(e.target.value)} placeholder="חיפוש לפי שם/טלפון..." style={{ ...inputStyle, width: '100%' }} />
              {results.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {results.map((r) => (
                    <button key={r.id} type="button" onClick={() => { setContact(r); setResults([]); }} style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }}>
                      {r.first} {r.last} <span style={{ color: 'var(--text-muted)' }}>{r.phone || r.email || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>נושא</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...inputStyle, width: '100%' }} placeholder="מה הבעיה?" />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>חומרה</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              {Object.entries(SEVERITY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>קורס (אופציונלי)</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              <option value="">—</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: '#c62828' }}>{error}</div>}

        <button type="button" onClick={handleCreate} disabled={isPending || !contact || !subject.trim()} style={{ ...primaryBtn, padding: '10px 18px', borderRadius: 8 }}>
          {isPending ? 'יוצר...' : 'יצירת קריאה'}
        </button>
      </div>
    </div>
  );
}
