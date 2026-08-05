'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addContactsToCampaign, updateCampaignContact, removeContactFromCampaign, markContactsEligibleForCalendar, addDedication, removeDedication, unlockDedication } from '../actions';
import { DEDICATION_TEMPLATES } from '../../../components/pipelines';

// קטגוריות ברירת מחדל - משמשות רק אם רשימת הבחירה הדינמית (הגדרות ← רשימות
// בחירה) ריקה, כדי שהמסך לעולם לא יישאר בלי אף קטגוריה לבחור
const DEFAULT_CATEGORIES = ['חם', 'קר', 'תורם בסכום גדול', 'תורם חוזר', 'לא רלוונטי'];

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

export default function CampaignDetailClient({ campaignId, campaignKind, workspaceId, isDonationsWorkspace, initialRows, availableContacts = [], agents = [], categories = [], campaignStages = { order: [], labels: {}, colors: {} }, extraFields = [] }) {
  const CATEGORIES = categories.length ? categories : DEFAULT_CATEGORIES;
  const [rows, setRows] = useState(initialRows);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [fieldFilters, setFieldFilters] = useState({});

  function setFieldFilter(key, value) {
    setFieldFilters((prev) => ({ ...prev, [key]: value }));
  }
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

  const showPickerList = search.trim().length >= 2 || !!deptFilter || !!tagFilter || Object.values(fieldFilters).some(Boolean);
  const filtered = useMemo(() => {
    if (!showPickerList) return [];
    let result = availableContacts;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => `${c.name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(q));
    }
    if (deptFilter) result = result.filter((c) => (c.departments || []).includes(deptFilter));
    if (tagFilter) result = result.filter((c) => (c.tags || []).includes(tagFilter));
    const activeFieldFilterEntries = Object.entries(fieldFilters).filter(([, v]) => v);
    if (activeFieldFilterEntries.length > 0) {
      result = result.filter((c) => activeFieldFilterEntries.every(([key, value]) => {
        const fieldDef = extraFields.find((f) => f.key === key);
        const actual = c.extraFields?.[key];
        if (fieldDef?.type === 'select') return actual === value;
        return (actual || '').toString().toLowerCase().includes(value.toLowerCase());
      }));
    }
    return result.slice(0, 100);
  }, [availableContacts, search, deptFilter, tagFilter, fieldFilters, extraFields, showPickerList]);

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
      {campaignKind !== 'dedication' && rows.length > 0 && (
        <CampaignOverviewDashboard rows={rows} agents={agents} campaignStages={campaignStages} />
      )}

      <div style={{ marginBottom: 14 }}>
        {adding ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14 }}>
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
                <button type="button" onClick={() => { setSearch(''); setDeptFilter(''); setTagFilter(''); setFieldFilters({}); }} style={ghostBtn()}>
                  ניקוי סינון
                </button>
              )}
            </div>
            {extraFields.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {extraFields.map((f) => (
                  f.type === 'select' ? (
                    <select key={f.key} value={fieldFilters[f.key] || ''} onChange={(e) => setFieldFilter(f.key, e.target.value)} style={inputStyle}>
                      <option value="">{f.label}</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      key={f.key}
                      value={fieldFilters[f.key] || ''}
                      onChange={(e) => setFieldFilter(f.key, e.target.value)}
                      placeholder={f.label}
                      style={inputStyle}
                    />
                  )
                ))}
              </div>
            )}
            {!showPickerList && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>הקלידו לפחות 2 תווים לחיפוש, או בחרו מחלקה/תגית לסינון</div>
            )}
            {showPickerList && filtered.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>אין תוצאות (או שכולם כבר בקמפיין)</div>
            )}
            {filtered.length > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <button type="button" onClick={() => setPickIds((prev) => new Set([...prev, ...filtered.map((c) => c.id)]))} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 12 }}>
                  בחר את כל התוצאות המסוננות ({filtered.length})
                </button>
                {pickIds.size > 0 && (
                  <button type="button" onClick={() => setPickIds(new Set())} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 12 }}>
                    נקה בחירה
                  </button>
                )}
              </div>
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

      {campaignKind !== 'dedication' && (
        <BulkAssignBar selected={selectedRows} setSelected={setSelectedRows} agents={agents} onApply={handleChange} rows={rows} workspaceId={workspaceId} isDonationsWorkspace={isDonationsWorkspace} />
      )}

      {campaignKind === 'dedication' ? (
        <DedicationCampaignTable rows={rows} workspaceId={workspaceId} onRemoveFromCampaign={handleRemove} isPending={isPending} />
      ) : (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflowX: 'auto' }}>
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
                    <select
                      value={r.status}
                      onChange={(e) => handleChange(r.rowId, { status: e.target.value })}
                      disabled={isPending}
                      style={{
                        ...cellSelect(),
                        background: (campaignStages.colors[r.status] || {}).bg || '#f4f4f5',
                        color: (campaignStages.colors[r.status] || {}).color || '#52525b',
                        border: 'none', fontWeight: 500,
                      }}
                    >
                      {campaignStages.order.map((s) => <option key={s} value={s}>{campaignStages.labels[s] || s}</option>)}
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
      )}
    </div>
  );
}

// דאשבורד ניהולי לקמפיין - מחושב כליינט-קומפוננטה טהורה מתוך rows/agents
// שכבר נטענו לעמוד, בלי שאילתת DB נוספת. העמוד עצמו כבר manager-only
// בגישה (isManagerOfWorkspace guard ב-page.js) אז אין צורך בבדיקת הרשאה
// נוספת כאן.
function CampaignOverviewDashboard({ rows, agents, campaignStages }) {
  const total = rows.length;
  const wonCount = campaignStages.wonStage ? rows.filter((r) => r.status === campaignStages.wonStage).length : 0;
  const byStatus = campaignStages.order.map((s) => ({
    key: s, label: campaignStages.labels[s] || s, count: rows.filter((r) => r.status === s).length,
  }));
  const byAgent = agents
    .map((a) => ({ id: a.id, name: a.name, count: rows.filter((r) => r.assignedTo === a.id).length }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count);
  const unassignedCount = rows.filter((r) => !r.assignedTo).length;

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: '1 1 120px', background: 'var(--bg-secondary, #fafafa)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{total}</div>
          <div style={{ fontSize: 11, color: '#9b9b9b' }}>סה"כ אנשי קשר</div>
        </div>
        {byStatus.map((s) => (
          <div key={s.key} style={{ flex: '1 1 120px', background: 'var(--bg-secondary, #fafafa)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{s.count}</div>
            <div style={{ fontSize: 11, color: '#9b9b9b' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 120px', background: '#f0fdf4', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{total ? Math.round((wonCount / total) * 100) : 0}%</div>
          <div style={{ fontSize: 11, color: '#16a34a' }}>אחוז הצלחה</div>
        </div>
      </div>

      {byAgent.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 6 }}>פילוח לפי נציג</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {byAgent.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 120, flexShrink: 0 }}>{a.name}</span>
                <div style={{ flex: 1, height: 8, background: '#f2f2f2', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(a.count / total) * 100}%`, background: '#0a0a0a', borderRadius: 999 }} />
                </div>
                <span style={{ width: 60, textAlign: 'left', color: '#6b6b6b' }}>{a.count} ({Math.round((a.count / total) * 100)}%)</span>
              </div>
            ))}
            {unassignedCount > 0 && (
              <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 4 }}>{unassignedCount} ללא נציג משויך</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// טבלה ייעודית לקמפיין ההקדשות (kind='dedication') - לכל איש קשר, רשימת
// תאריכי ההקדשה שלו (כמה שירצה, למשל שני יארצייטים) עם הוספה/הסרה/נעילה,
// במקום עמודות קטגוריה/נציג/סטטוס שלא רלוונטיות כאן.
function DedicationCampaignTable({ rows, workspaceId, onRemoveFromCampaign, isPending: parentPending }) {
  const router = useRouter();
  const [rowsState, setRowsState] = useState(rows);
  const [openRowId, setOpenRowId] = useState(null);

  function refreshRow(rowId, dedications) {
    setRowsState((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, dedications } : r)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rowsState.length === 0 && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14, fontSize: 13, color: '#9b9b9b' }}>
          עדיין לא נוספו אנשי קשר לקמפיין
        </div>
      )}
      {rowsState.map((r) => (
        <div key={r.rowId} style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: r.dedications.length || openRowId === r.rowId ? 10 : 0 }}>
            <Link href={`/dashboard/contacts/${r.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none', flex: 1 }}>
              {r.name || '—'}
            </Link>
            <span style={{ fontSize: 12, color: '#9b9b9b' }}>{r.phone || ''}</span>
            <button type="button" onClick={() => setOpenRowId(openRowId === r.rowId ? null : r.rowId)} style={ghostBtn()}>
              {openRowId === r.rowId ? 'סגירה' : '+ הוספת תאריך'}
            </button>
            <button type="button" onClick={() => onRemoveFromCampaign(r.rowId)} disabled={parentPending} title="הסרה מהקמפיין"
              style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>

          {r.dedications.map((d) => (
            <DedicationEntryRow key={d.id} entry={d} onRemoved={() => refreshRow(r.rowId, r.dedications.filter((e) => e.id !== d.id))} onUnlocked={() => { refreshRow(r.rowId, r.dedications.map((e) => (e.id === d.id ? { ...e, locked_at: null } : e))); router.refresh(); }} />
          ))}

          {openRowId === r.rowId && (
            <DedicationAddForm
              contactId={r.contactId}
              workspaceId={workspaceId}
              onAdded={(entry) => { refreshRow(r.rowId, [...r.dedications, entry].sort((a, b) => new Date(a.dedication_date) - new Date(b.dedication_date))); setOpenRowId(null); router.refresh(); }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function DedicationEntryRow({ entry, onRemoved, onUnlocked }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeDedication(entry.id);
      if (res?.error) { setError(res.error); return; }
      onRemoved();
    });
  }

  function handleUnlock() {
    startTransition(async () => {
      const res = await unlockDedication(entry.id);
      if (res?.error) { setError(res.error); return; }
      onUnlocked();
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderTop: '1px solid #f5f5f5', padding: '6px 0', fontSize: 12.5 }}>
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{new Date(entry.dedication_date).toLocaleDateString('he-IL')}</span>
      <span style={{ flex: 1 }}>
        {entry.dedication_text}
        {(entry.names || []).length > 0 && <span> — {entry.names.join(', ')}</span>}
        {entry.note && <span style={{ color: '#9b9b9b' }}> · {entry.note}</span>}
        {entry.locked_at && (
          <span style={{ marginInlineStart: 6, fontSize: 10.5, color: '#a4691f', background: '#f6ead9', borderRadius: 4, padding: '1px 6px' }}>🔒 נעול להדפסה</span>
        )}
        {error && <div style={{ color: '#b23b2f', fontSize: 11 }}>{error}</div>}
      </span>
      {!entry.locked_at && (
        <button type="button" onClick={handleRemove} disabled={isPending} title="הסרה" style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 12 }}>✕</button>
      )}
      {entry.locked_at && (
        <button type="button" onClick={handleUnlock} disabled={isPending} title="שחרור נעילה" style={{ background: 'none', border: 'none', color: '#a4691f', cursor: 'pointer', fontSize: 11 }}>🔓 שחרור</button>
      )}
    </div>
  );
}

function DedicationAddForm({ contactId, workspaceId, onAdded }) {
  const [date, setDate] = useState('');
  const [template, setTemplate] = useState(DEDICATION_TEMPLATES[0]);
  const [customText, setCustomText] = useState('');
  const [note, setNote] = useState('');
  const [names, setNames] = useState(['']);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const isCustom = template === 'נוסח חופשי';

  function handleAdd() {
    setError(null);
    const text = isCustom ? customText.trim() : `${template} ${customText}`.trim();
    if (!date || !text) { setError('יש למלא תאריך ונוסח'); return; }
    startTransition(async () => {
      const res = await addDedication(contactId, workspaceId, date, text, note, names);
      if (res?.error) { setError(res.error); return; }
      onAdded({ id: `tmp-${Date.now()}`, dedication_date: date, dedication_text: text, note: note.trim() || null, names: names.map((n) => n.trim()).filter(Boolean), locked_at: null });
    });
  }

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #f5f5f5', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      <select value={template} onChange={(e) => setTemplate(e.target.value)} style={inputStyle}>
        {DEDICATION_TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="text" value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder={isCustom ? 'נוסח ההקדשה המלא...' : 'שם / המשך הנוסח...'} style={inputStyle} />
      <div style={{ fontSize: 11, color: '#9b9b9b' }}>שמות נוספים תחת אותה הקדשה (הקדשה משפחתית, אופציונלי):</div>
      {names.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <input type="text" value={n} onChange={(e) => setNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))} placeholder="שם נוסף..." style={{ ...inputStyle, flex: 1 }} />
          {names.length > 1 && (
            <button type="button" onClick={() => setNames((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer' }}>✕</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setNames((prev) => [...prev, ''])} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #d0d0d0', borderRadius: 4, padding: '2px 8px', fontSize: 11.5, color: '#666', cursor: 'pointer' }}>
        + הוספת שם
      </button>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה (אופציונלי)" style={inputStyle} />
      {error && <div style={{ color: '#b23b2f', fontSize: 11.5 }}>{error}</div>}
      <button type="button" onClick={handleAdd} disabled={isPending} style={primaryBtn()}>הוספה</button>
    </div>
  );
}

// סרגל שליחה לנציג - מופיע רק כשנבחרו שורות (איש קשר אחד, כמה, או כולם
// דרך תיבת "בחירת הכל" בכותרת הטבלה), ומשייך את כולם לנציג הנבחר בבת
// אחת דרך אותה updateCampaignContact הקיימת (לולאת Promise.all, בדיוק
// כמו BulkActionBar בלוח הלידים).
function BulkAssignBar({ selected, setSelected, agents, onApply, rows, workspaceId, isDonationsWorkspace }) {
  const [isPending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState('');
  const [tagDone, setTagDone] = useState(false);
  const [tagError, setTagError] = useState(null);

  if (selected.size === 0) return null;

  function applyAgent() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await Promise.all(ids.map((rowId) => onApply(rowId, { assignedTo: agentId })));
      setAgentId('');
      setSelected(new Set());
    });
  }

  // סימון כזכאים ליום בלוח שנה - משייך את כל אנשי הקשר הנבחרים (בכמות,
  // מכל קמפיין תרומות - לא רק מקמפיין ההקדשות עצמו) לקמפיין ההקדשות של
  // המחלקה, במקום תגית (מוחלף לגמרי - ר' campaigns/actions.js)
  function applyCalendarEligible() {
    const contactIds = rows.filter((r) => selected.has(r.rowId)).map((r) => r.contactId);
    setTagDone(false);
    setTagError(null);
    startTransition(async () => {
      const res = await markContactsEligibleForCalendar(workspaceId, contactIds);
      if (res?.error) { setTagError(res.error); return; }
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

      {isDonationsWorkspace && (
        <button type="button" onClick={applyCalendarEligible} disabled={isPending} style={{ background: 'var(--bg)', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878' }}>
          📅 סימון כזכאים ליום בלוח שנה
        </button>
      )}
      {tagDone && <span style={{ fontSize: 11.5, color: '#1f7a3d' }}>✓ סומנו</span>}
      {tagError && <span style={{ fontSize: 11.5, color: '#b23b2f' }}>{tagError}</span>}

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
  return { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
}
function cellSelect() {
  return { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 };
}
