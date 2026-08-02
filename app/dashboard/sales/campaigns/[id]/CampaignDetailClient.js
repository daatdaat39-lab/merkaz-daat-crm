'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addContactsToCampaign, updateCampaignContact, removeContactFromCampaign } from '../actions';

// קטגוריות סיווג בתוך קמפיין - קבועות כאן כדי שיהיה קל לשנות/להוסיף
const CATEGORIES = ['חם', 'קר', 'תורם בסכום גדול', 'תורם חוזר', 'לא רלוונטי'];

export default function CampaignDetailClient({ campaignId, initialRows, availableContacts = [], agents = [] }) {
  const [rows, setRows] = useState(initialRows);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = search.trim().length >= 2
    ? availableContacts.filter((c) =>
        `${c.name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30)
    : [];

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await addContactsToCampaign(campaignId, Array.from(selected));
      if (res?.error) { setError(res.error); return; }
      setSelected(new Set()); setSearch(''); setAdding(false);
      router.refresh();
    });
  }

  function handleChange(rowId, changes) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...changes } : r)));
    setError(null);
    startTransition(async () => {
      const res = await updateCampaignContact(rowId, changes);
      if (res?.error) { setError(res.error); router.refresh(); }
    });
  }

  function handleRemove(rowId) {
    startTransition(async () => {
      const res = await removeContactFromCampaign(rowId);
      if (res?.error) { setError(res.error); return; }
      setRows((prev) => prev.filter((r) => r.rowId !== rowId));
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        {adding ? (
          <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש איש קשר להוספה (שם / טלפון / מייל)..."
              autoFocus
              style={{ width: '100%', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }}
            />
            {search.trim().length >= 2 && filtered.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b', marginTop: 8 }}>אין תוצאות (או שכולם כבר בקמפיין)</div>
            )}
            {filtered.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                {filtered.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: '#9b9b9b' }}>{c.phone || c.email || ''}</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={handleAdd} disabled={isPending || selected.size === 0} style={primaryBtn()}>
                הוספה ({selected.size})
              </button>
              <button type="button" onClick={() => { setAdding(false); setSelected(new Set()); setSearch(''); }} style={ghostBtn()}>
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} style={primaryBtn()}>+ הוספת אנשי קשר לקמפיין</button>
        )}
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>שגיאה: {error}</div>}

      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              {['שם', 'טלפון', 'קטגוריה', 'נציג מטפל', 'סטטוס', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted, #9b9b9b)', padding: '10px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '14px', fontSize: 13, color: '#9b9b9b' }}>עדיין לא נוספו אנשי קשר לקמפיין</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.rowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '10px 14px' }}>
                  <Link href={`/dashboard/contacts/${r.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                    {r.name || '—'}
                  </Link>
                </td>
                <td style={{ padding: '10px 14px' }}>{r.phone || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <select value={r.category} onChange={(e) => handleChange(r.rowId, { category: e.target.value })} disabled={isPending} style={cellSelect()}>
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <select value={r.assignedTo} onChange={(e) => handleChange(r.rowId, { assignedTo: e.target.value })} disabled={isPending} style={cellSelect()}>
                    <option value="">— ללא —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <select value={r.status} onChange={(e) => handleChange(r.rowId, { status: e.target.value })} disabled={isPending} style={cellSelect()}>
                    <option value="pending">ממתין</option>
                    <option value="done">טופל</option>
                  </select>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button type="button" onClick={() => handleRemove(r.rowId)} disabled={isPending} title="הסרה מהקמפיין"
                    style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function primaryBtn() {
  return { background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
}
function ghostBtn() {
  return { background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
}
function cellSelect() {
  return { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 };
}
