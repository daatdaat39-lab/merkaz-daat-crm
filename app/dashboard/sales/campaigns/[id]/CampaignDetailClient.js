'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addContactsToCampaign, updateCampaignContact, removeContactFromCampaign } from '../actions';
import { addContactTag } from '../../../contacts/actions';
import { CALENDAR_ELIGIBLE_TAG } from '../../../components/pipelines';

// קטגוריות ברירת מחדל - משמשות רק אם רשימת הבחירה הדינמית (הגדרות ← רשימות
// בחירה) ריקה, כדי שהמסך לעולם לא יישאר בלי אף קטגוריה לבחור
const DEFAULT_CATEGORIES = ['חם', 'קר', 'תורם בסכום גדול', 'תורם חוזר', 'לא רלוונטי'];

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

export default function CampaignDetailClient({ campaignId, initialRows, availableContacts = [], agents = [], categories = [] }) {
  const CATEGORIES = categories.length ? categories : DEFAULT_CATEGORIES;
  const [rows, setRows] = useState(initialRows);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [pickIds, setPickIds] = useState(new Set());
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const deptOptions = useMemo(
    () => Array.from(new Set(availableContacts.flatMap((c) => c.departments || []))).sort((a, b) => a.localeCompare(b, 'he')),
    [availableContacts]
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(availableContacts.flatMap((c) => c.tags || []))).sort((a, b) => a.localeCompare(b, 'he')),
    [availableContacts]
  );

  const showPickerList = search.trim().length >= 2 || !!deptFilter || !!tagFilter;
  const filtered = useMemo(() => {
    if (!showPickerList) return [];
    let result = availableContacts;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => `${c.name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(q));
    }
    if (deptFilter) result = result.filter((c) => (c.departments || []).includes(deptFilter));
    if (tagFilter) result = result.filter((c) => (c.tags || []).includes(tagFilter));
    return result.slice(0, 100);
  }, [availableContacts, search, deptFilter, tagFilter, showPickerList]);

  function togglePick(id) {
    setPickIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleRowSelect(id) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allRowsSelected = rows.length > 0 && rows.every((r) => selectedRows.has(r.rowId));
  function toggleSelectAllRows() {
    setSelectedRows((prev) => {
      if (allRowsSelected) return new Set();
      return new Set(rows.map((r) => r.rowId));
    });
  }

  function handleAdd() {
    if (pickIds.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await addContactsToCampaign(campaignId, Array.from(pickIds));
      if (res?.error) { setError(res.error); return; }
      setPickIds(new Set()); setSearch(''); setDeptFilter(''); setTagFilter(''); setAdding(false);
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
      setSelectedRows((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        {adding ? (
          <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש איש קשר להוספה (שם / טלפון / מייל)..."
                autoFocus
                style={{ ...inputStyle, flex: '1 1 220px' }}
              />
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={inputStyle}>
                <option value="">כל המחלקות</option>
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={inputStyle}>
                <option value="">כל התגיות</option>
                {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {(deptFilter || tagFilter || search) && (
                <button type="button" onClick={() => { setSearch(''); setDeptFilter(''); setTagFilter(''); }} style={ghostBtn()}>
                  ניקוי סינון
                </button>
              )}
            </div>
            {!showPickerList && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>הקלידו לפחות 2 תווים לחיפוש, או בחרו מחלקה/תגית לסינון</div>
            )}
            {showPickerList && filtered.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>אין תוצאות (או שכולם כבר בקמפיין)</div>
            )}
            {filtered.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                {filtered.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
                    <input type="checkbox" checked={pickIds.has(c.id)} onChange={() => togglePick(c.id)} />
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: '#9b9b9b' }}>{c.phone || c.email || ''}</span>
                    {(c.departments || []).length > 0 && <span style={{ color: '#9b9b9b', fontSize: 11 }}>· {c.departments.join(', ')}</span>}
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={handleAdd} disabled={isPending || pickIds.size === 0} style={primaryBtn()}>
                הוספה ({pickIds.size})
              </button>
              <button type="button" onClick={() => { setAdding(false); setPickIds(new Set()); setSearch(''); setDeptFilter(''); setTagFilter(''); }} style={ghostBtn()}>
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} style={primaryBtn()}>+ הוספת אנשי קשר לקמפיין</button>
        )}
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>שגיאה: {error}</div>}

      <BulkAssignBar selected={selectedRows} setSelected={setSelectedRows} agents={agents} onApply={handleChange} rows={rows} />

      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>
                <input type="checkbox" checked={allRowsSelected} onChange={toggleSelectAllRows} disabled={rows.length === 0} />
              </th>
              {['שם', 'טלפון', 'קטגוריה', 'נציג מטפל', 'סטטוס', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted, #9b9b9b)', padding: '10px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '14px', fontSize: 13, color: '#9b9b9b' }}>עדיין לא נוספו אנשי קשר לקמפיין</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.rowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedRows.has(r.rowId)} onChange={() => toggleRowSelect(r.rowId)} />
                </td>
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

// סרגל שליחה לנציג - מופיע רק כשנבחרו שורות (איש קשר אחד, כמה, או כולם
// דרך תיבת "בחירת הכל" בכותרת הטבלה), ומשייך את כולם לנציג הנבחר בבת
// אחת דרך אותה updateCampaignContact הקיימת (לולאת Promise.all, בדיוק
// כמו BulkActionBar בלוח הלידים).
function BulkAssignBar({ selected, setSelected, agents, onApply, rows }) {
  const [isPending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState('');
  const [tagDone, setTagDone] = useState(false);

  if (selected.size === 0) return null;

  function applyAgent() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await Promise.all(ids.map((rowId) => onApply(rowId, { assignedTo: agentId })));
      setAgentId('');
      setSelected(new Set());
    });
  }

  // סימון כזכאים ליום בלוח שנה - מוסיף את התגית לכל אנשי הקשר הנבחרים
  // (בכמות דרך הקמפיין) בבת אחת, במקום אחד-אחד בכרטיס האישי
  function applyCalendarEligible() {
    const contactIds = rows.filter((r) => selected.has(r.rowId)).map((r) => r.contactId);
    setTagDone(false);
    startTransition(async () => {
      await Promise.all(contactIds.map((id) => addContactTag(id, CALENDAR_ELIGIBLE_TAG)));
      setTagDone(true);
    });
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14,
      background: '#eef2f7', border: '1px solid #c9d6e3', borderRadius: 8, padding: '10px 14px',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3b5878' }}>נבחרו {selected.size} אנשי קשר</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
          <option value="">— ללא —</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" onClick={applyAgent} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          שליחה לנציג
        </button>
      </div>

      <button type="button" onClick={applyCalendarEligible} disabled={isPending} style={{ background: '#fff', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878' }}>
        📅 סימון כזכאים ליום בלוח שנה
      </button>
      {tagDone && <span style={{ fontSize: 11.5, color: '#1f7a3d' }}>✓ סומנו</span>}

      <button
        type="button"
        onClick={() => setSelected(new Set())}
        style={{ background: 'none', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878', marginInlineStart: 'auto' }}
      >
        ביטול בחירה
      </button>
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
