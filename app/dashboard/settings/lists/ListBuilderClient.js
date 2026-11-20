'use client';

import { useState, useTransition, useEffect } from 'react';
import { searchContactListCandidates, getExistingListTitles, recordContactListEntries } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

function downloadCSV(rows, filename) {
  function cell(v) {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  }
  const headers = ['שם פרטי', 'שם משפחה', 'טלפון', 'מייל', 'מקור'];
  const lines = rows.map((r) => [r.first, r.last, r.phone, r.email, r.source].map(cell).join(','));
  const csv = '﻿' + [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ListBuilderClient({ workspaces = [], courses = [], pipelinesByWorkspace = {} }) {
  const [source, setSource] = useState('');
  const [stageWorkspaceId, setStageWorkspaceId] = useState('');
  const [stages, setStages] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [hasCourseEnrollment, setHasCourseEnrollment] = useState(null);

  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [listTitle, setListTitle] = useState('');
  const [existingTitles, setExistingTitles] = useState([]);
  const [error, setError] = useState(null);
  const [recordMsg, setRecordMsg] = useState(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => { getExistingListTitles().then(setExistingTitles); }, []);

  const selectedWorkspaceName = workspaces.find((w) => w.id === stageWorkspaceId)?.name;
  const selectedWorkspacePipeline = selectedWorkspaceName ? (pipelinesByWorkspace[selectedWorkspaceName] || { order: [], sideStages: [], labels: {} }) : null;
  const stageOptions = selectedWorkspacePipeline ? [...selectedWorkspacePipeline.order, ...(selectedWorkspacePipeline.sideStages || [])] : [];

  function toggleStage(s) {
    setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function handleSearch() {
    setError(null);
    setRecordMsg(null);
    startTransition(async () => {
      const res = await searchContactListCandidates({
        source: source.trim() || null,
        stageWorkspaceId: stageWorkspaceId || null,
        stages: stages.length ? stages : null,
        courseId: courseId || null,
        hasCourseEnrollment,
        limit: 500,
      });
      if (res?.error) { setError(res.error); return; }
      setRows(res.rows);
      setTotal(res.total);
      setSelected(new Set());
    });
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!rows) return;
    setSelected(new Set(rows.map((r) => r.contact_id)));
  }

  function handleExport() {
    if (!rows || selected.size === 0) return;
    const selectedRows = rows.filter((r) => selected.has(r.contact_id));
    downloadCSV(selectedRows, `רשימה-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleRecord() {
    setRecordMsg(null);
    startTransition(async () => {
      const res = await recordContactListEntries(Array.from(selected), listTitle);
      if (res?.error) { setError(res.error); return; }
      setRecordMsg(`✓ נרשם ל-${res.count} אנשי-קשר`);
      if (!existingTitles.includes(listTitle.trim())) setExistingTitles((prev) => [listTitle.trim(), ...prev]);
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', background: 'var(--bg-secondary, #f9f9f9)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 3 }}>מקור</div>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="כל המקורות" style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 3 }}>מחלקה</div>
          <select value={stageWorkspaceId} onChange={(e) => { setStageWorkspaceId(e.target.value); setStages([]); }} style={inputStyle}>
            <option value="">כל המחלקות</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 3 }}>קורס ספציפי</div>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle}>
            <option value="">כל הקורסים</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 3 }}>רשום לקורס כלשהו</div>
          <select value={hasCourseEnrollment === null ? '' : String(hasCourseEnrollment)} onChange={(e) => setHasCourseEnrollment(e.target.value === '' ? null : e.target.value === 'true')} style={inputStyle}>
            <option value="">לא משנה</option>
            <option value="true">כן</option>
            <option value="false">לא</option>
          </select>
        </div>
        <button type="button" onClick={handleSearch} disabled={isPending} style={{ background: 'var(--accent, #1f4d3d)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'מחפש...' : 'חיפוש'}
        </button>
      </div>

      {stageOptions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {stageOptions.map((s) => (
            <button
              key={s} type="button" onClick={() => toggleStage(s)}
              style={{
                fontSize: 11.5, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                border: stages.includes(s) ? '1px solid var(--accent, #1f4d3d)' : '1px solid var(--border, #e5e5e5)',
                background: stages.includes(s) ? 'var(--accent-soft, #e4ede8)' : 'var(--bg)',
              }}
            >{selectedWorkspacePipeline?.labels?.[s] || s}</button>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 12.5, color: 'var(--red, #b23b2f)', marginBottom: 10 }}>שגיאה: {error}</div>}

      {rows && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5 }}>{total} תוצאות, {selected.size} נבחרו</span>
            <button type="button" onClick={selectAll} style={{ ...inputStyle, cursor: 'pointer' }}>בחר הכל</button>
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #f9f9f9)' }}>
                  <th style={{ padding: 8 }}></th>
                  <th style={{ padding: 8, textAlign: 'right' }}>שם</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>טלפון</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>מקור</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.contact_id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                    <td style={{ padding: 8 }}>
                      <input type="checkbox" checked={selected.has(r.contact_id)} onChange={() => toggleSelect(r.contact_id)} />
                    </td>
                    <td style={{ padding: 8 }}>{r.first} {r.last}</td>
                    <td style={{ padding: 8 }}>{r.phone || '—'}</td>
                    <td style={{ padding: 8 }}>{r.source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: 'var(--bg-secondary, #f9f9f9)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 3 }}>שם הרשימה</div>
              <input
                value={listTitle}
                onChange={(e) => setListTitle(e.target.value)}
                list="existing-list-titles"
                placeholder="בחר שם קיים או הקלד חדש"
                style={{ ...inputStyle, minWidth: 220 }}
              />
              <datalist id="existing-list-titles">
                {existingTitles.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <button type="button" onClick={handleExport} disabled={selected.size === 0} style={{ ...inputStyle, cursor: 'pointer' }}>
              ⬇ ייצוא ל-CSV ({selected.size})
            </button>
            <button
              type="button" onClick={handleRecord} disabled={isPending || selected.size === 0 || !listTitle.trim()}
              style={{ background: 'var(--accent, #1f4d3d)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer' }}
            >
              רישום בהיסטוריה
            </button>
            {recordMsg && <span style={{ fontSize: 12, color: 'var(--green, #2f7d4f)' }}>{recordMsg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
