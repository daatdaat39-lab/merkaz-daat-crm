'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { STAGE_LABELS, STAGE_ORDER, StageBadge } from '../../components/ui';

export default function PipelineBoard({ contacts, moveStageAction }) {
  const [view, setView] = useState('kanban'); // 'kanban' | 'table'
  const [search, setSearch] = useState('');
  const [dragOverStage, setDragOverStage] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [localContacts, setLocalContacts] = useState(contacts);

  const filtered = useMemo(() => {
    if (!search.trim()) return localContacts;
    const q = search.trim().toLowerCase();
    return localContacts.filter((c) =>
      `${c.first} ${c.last}`.toLowerCase().includes(q) ||
      (c.source || '').toLowerCase().includes(q)
    );
  }, [localContacts, search]);

  function moveContact(contactId, newStage) {
    setLocalContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, stage: newStage } : c)));
    startTransition(async () => {
      await moveStageAction(contactId, newStage);
    });
  }

  function handleDrop(e, stage) {
    e.preventDefault();
    setDragOverStage(null);
    const contactId = e.dataTransfer.getData('text/contact-id');
    if (contactId) moveContact(contactId, stage);
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
          {STAGE_ORDER.map((stage, i) => {
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
                      key={c.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/contact-id', c.id)}
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
                      <div style={{ fontSize: 10, color: '#c0c0c0', marginTop: 6 }}>גרור לשלב אחר ⠿</div>
                    </div>
                  ))}
                  {stageContacts.length === 0 && (
                    <div style={{ fontSize: 11, color: '#c0c0c0', textAlign: 'center', padding: '20px 0' }}>גרור לכאן</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              {['שם', 'שלב', 'מקור', 'נוצר'].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, color: '#9b9b9b', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>
                  <Link href={`/dashboard/contacts/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                    {c.first} {c.last}
                  </Link>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>
                  <select
                    defaultValue={c.stage}
                    onChange={(e) => moveContact(c.id, e.target.value)}
                    style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
                  >
                    {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.source || '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString('he-IL')}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '12px 16px', fontSize: 13, color: '#9b9b9b' }}>אין תוצאות</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
