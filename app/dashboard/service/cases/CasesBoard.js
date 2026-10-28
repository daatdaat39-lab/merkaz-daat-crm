'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchContacts } from '../../contacts/actions';
import { createCase } from './actions';
import { refreshStaleCaseActionChips } from './aiChipActions';
import { SEVERITY_LABELS } from '../../lib/serviceSla';
import CaseTableRow from './CaseTableRow';
import { RefreshIcon } from '../../components/icons';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const btnStyle = { ...inputStyle, cursor: 'pointer' };
const primaryBtn = { ...btnStyle, background: 'var(--k-accent)', color: '#fff', fontWeight: 600, border: 'none' };

const TABS = [
  { key: 'active', label: 'פתוחות' },
  { key: 'closed', label: 'סגורות' },
  { key: 'all', label: 'הכל' },
];

export default function CasesBoard({ cases, agents, courses, workspaceId }) {
  const [tab, setTab] = useState('active');
  const [showNew, setShowNew] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [refreshMsg, setRefreshMsg] = useState('');
  const router = useRouter();

  const filtered = cases.filter((c) => {
    if (tab === 'active') return c.status !== 'closed';
    if (tab === 'closed') return c.status === 'closed';
    return true;
  });

  const staleAiCount = cases.filter((c) => c.aiActionSummaryStale).length;

  function handleRefreshAi() {
    setRefreshMsg('');
    startRefresh(async () => {
      const res = await refreshStaleCaseActionChips(workspaceId);
      if (res?.error) { setRefreshMsg(res.error); return; }
      setRefreshMsg(`עודכנו ${res.refreshed} המלצות`);
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              fontFamily: 'var(--k-font-display)',
              background: tab === t.key ? 'var(--k-text)' : 'none', color: tab === t.key ? 'var(--k-bg)' : 'var(--k-text-muted)',
              border: '1px solid ' + (tab === t.key ? 'var(--k-text)' : 'var(--k-border)'), borderRadius: 8, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
          <button
            type="button" onClick={handleRefreshAi} disabled={refreshing || staleAiCount === 0}
            style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6, opacity: staleAiCount === 0 ? 0.5 : 1, cursor: staleAiCount === 0 ? 'default' : 'pointer' }}
          >
            <RefreshIcon size={13} /> {refreshing ? 'מרענן...' : `רענון המלצות AI${staleAiCount > 0 ? ` (${Math.min(staleAiCount, 25)})` : ''}`}
          </button>
          {refreshMsg && <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>{refreshMsg}</span>}
        </div>
        <button type="button" onClick={() => setShowNew(true)} style={primaryBtn}>+ קריאה חדשה</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>אין קריאות כאן</div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--k-border)', textAlign: 'right' }}>
                {['#', 'איש קשר', 'נושא', 'חומרה', 'SLA', 'סטטוס', 'נציג מטפל'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--k-text-muted)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <CaseTableRow key={c.id} c={c} agents={agents} />
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
