'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { STAGE_LABELS } from '../../components/ui';
import { CLOSE_REASONS } from '../../components/pipelines';

export default function PipelineBoard({ contacts, moveStageAction, stages }) {
  const [view, setView] = useState('kanban'); // 'kanban' | 'table'
  const [search, setSearch] = useState('');
  const [dragOverStage, setDragOverStage] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [localContacts, setLocalContacts] = useState(contacts);
  const [closingId, setClosingId] = useState(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return localContacts;
    const q = search.trim().toLowerCase();
    return localContacts.filter((c) =>
      `${c.first} ${c.last}`.toLowerCase().includes(q) ||
      (c.source || '').toLowerCase().includes(q)
    );
  }, [localContacts, search]);

  function moveContact(departmentRowId, newStage, closedReason) {
    setLocalContacts((prev) => prev.map((c) => (c.departmentRowId === departmentRowId ? { ...c, stage: newStage, closed_reason: closedReason || null } : c)));
    startTransition(async () => {
      await moveStageAction(departmentRowId, newStage, closedReason);
    });
  }

  function handleDrop(e, stage) {
    e.preventDefault();
    setDragOverStage(null);
    const departmentRowId = e.dataTransfer.getData('text/department-row-id');
    if (!departmentRowId) return;
    if (stage === 'closed') setClosingId(departmentRowId);
    else moveContact(departmentRowId, stage);
  }

  function handleCloseConfirm(departmentRowId, reason) {
    moveContact(departmentRowId, 'closed', reason);
    setClosingId(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או מקור..."
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 12px', fontSize: 13, width: 220 }}
        />
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button
            onClick={() => setView('kanban')}
            style={{
              padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
              background: view === 'kanban' ? 'var(--text)' : '#fff', color: view === 'kanban' ? '#fff' : 'var(--text)',
            }}
          >
            📋 לוח
          </button>
          <button
            onClick={() => setView('table')}
            style={{
              padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
              background: view === 'table' ? 'var(--text)' : '#fff', color: view === 'table' ? '#fff' : 'var(--text)',
            }}
          >
            📄 טבלה
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
          {stages.map((stage, i) => {
            const stageContacts = filtered.filter((c) => c.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => handleDrop(e, stage)}
                style={{
                  minWidth: 230, flexShrink: 0, borderLeft: i > 0 ? '1px solid #e5e5e5' : 'none',
                  background: dragOverStage === stage ? '#eff6ff' : 'transparent', transition: 'background 0.1s',
                }}
              >
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e5e5', background: '#f9f9f9' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b6b6b' }}>{STAGE_LABELS[stage]}</div>
                  <div style={{ fontSize: 11, color: '#9b9b9b' }}>{stageContacts.length} לידים</div>
                </div>
                <div style={{ padding: 8, minHeight: 120 }}>
                  {stageContacts.map((c) => (
                    <div
                      key={c.departmentRowId}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/department-row-id', c.departmentRowId)}
                      style={{
                        background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '10px 12px',
                        marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'grab',
                        opacity: isPending ? 0.7 : 1,
                      }}
                    >
                      <Link href={`/dashboard/contacts/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{c.first} {c.last}</div>
                      </Link>
                      {c.source && (
                        <span style={{ background: '#f0f0f0', color: '#333', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>
                          {c.source}
                        </span>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: '#c0c0c0' }}>גרור לשלב אחר ⠿</div>
                        <button
                          onClick={() => setClosingId(c.departmentRowId)}
                          style={{ background: 'none', border: 'none', color: '#c0392b', fontSize: 10, cursor: 'pointer' }}
                        >
                          ✕ סגירה
                        </button>
                      </div>
                      {closingId === c.departmentRowId && (
                        <CloseReasonPicker onConfirm={(reason) => handleCloseConfirm(c.departmentRowId, reason)} onCancel={() => setClosingId(null)} />
                      )}
                    </div>
                  ))}
                  {stageContacts.length === 0 && (
                    <div style={{ fontSize: 11, color: '#c0c0c0', textAlign: 'center', padding: '20px 0' }}>גרור לכאן</div>
                  )}
                </div>
              </div>
            );
          })}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverStage('closed'); }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, 'closed')}
            style={{
              minWidth: 200, flexShrink: 0, borderLeft: '1px solid #e5e5e5',
              background: dragOverStage === 'closed' ? '#fef2f2' : 'transparent', transition: 'background 0.1s',
            }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e5e5', background: '#f9f9f9' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a3392f' }}>{STAGE_LABELS.closed}</div>
              <div style={{ fontSize: 11, color: '#9b9b9b' }}>{filtered.filter((c) => c.stage === 'closed').length} לידים</div>
            </div>
            <div style={{ padding: 8, minHeight: 120 }}>
              {filtered.filter((c) => c.stage === 'closed').map((c) => (
                <div key={c.departmentRowId} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '10px 12px', marginBottom: 8, opacity: 0.8 }}>
                  <Link href={`/dashboard/contacts/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.first} {c.last}</div>
                  </Link>
                  {c.closed_reason && <div style={{ fontSize: 10.5, color: '#9b9b9b', marginTop: 3 }}>{c.closed_reason}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              {['שם', 'שלב', 'מקור', 'נוצר', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, color: '#9b9b9b', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.departmentRowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>
                  <Link href={`/dashboard/contacts/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                    {c.first} {c.last}
                  </Link>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>
                  <select
                    value={c.stage}
                    onChange={(e) => {
                      if (e.target.value === 'closed') setClosingId(c.departmentRowId);
                      else moveContact(c.departmentRowId, e.target.value);
                    }}
                    style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
                  >
                    {stages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                    <option value="closed">{STAGE_LABELS.closed}</option>
                  </select>
                  {closingId === c.departmentRowId && (
                    <CloseReasonPicker onConfirm={(reason) => handleCloseConfirm(c.departmentRowId, reason)} onCancel={() => setClosingId(null)} />
                  )}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.source || '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString('he-IL')}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#9b9b9b' }}>{c.stage === 'closed' ? c.closed_reason : ''}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '12px 16px', fontSize: 13, color: '#9b9b9b' }}>אין תוצאות</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CloseReasonPicker({ onConfirm, onCancel }) {
  const [reason, setReason] = useState(CLOSE_REASONS[0]);
  return (
    <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6 }} onClick={(e) => e.stopPropagation()}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 4, marginBottom: 6 }}>
        {CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onConfirm(reason)} style={{ flex: 1, fontSize: 11, background: '#a3392f', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 0', cursor: 'pointer' }}>אישור</button>
        <button onClick={onCancel} style={{ flex: 1, fontSize: 11, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 0', cursor: 'pointer' }}>ביטול</button>
      </div>
    </div>
  );
}
