'use client';

import { useEffect, useState, useTransition } from 'react';
import DataGridRow from './DataGridRow';
import { fetchGridRows } from './actions';

const PAGE_SIZE = 100;

export default function DataGridClient({ workspaces = [] }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || '');
  const [mode, setMode] = useState('paged'); // 'paged' | 'all'
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null); // { rows, totalCount, baseFields, extraFields, pipeline }
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!workspaceId) return;
    setError(null);
    startTransition(async () => {
      const opts = mode === 'all' ? { all: true } : { page, pageSize: PAGE_SIZE };
      const res = await fetchGridRows(workspaceId, opts);
      if (res?.error) { setError(res.error); setData(null); return; }
      setData(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, mode, page]);

  function handleWorkspaceChange(id) {
    setWorkspaceId(id);
    setPage(1);
  }

  function handleModeChange(newMode) {
    setMode(newMode);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;

  if (workspaces.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אינך מנהל אף מחלקה.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={workspaceId} onChange={(e) => handleWorkspaceChange(e.target.value)} style={selectStyle()}>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button type="button" onClick={() => handleModeChange('paged')} style={modeBtnStyle(mode === 'paged')}>עמוד אחר עמוד</button>
          <button type="button" onClick={() => handleModeChange('all')} style={modeBtnStyle(mode === 'all')}>טען הכל</button>
        </div>

        {mode === 'paged' && data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isPending} style={pageBtnStyle()}>‹ הקודם</button>
            עמוד {page} מתוך {totalPages}
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isPending} style={pageBtnStyle()}>הבא ›</button>
          </div>
        )}

        {data && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>סה"כ {data.totalCount} אנשי קשר</span>}
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {isPending && !data && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>טוען...</div>}

      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={thStyle()}></th>
                {data.baseFields.map((f) => <th key={f.key} style={thStyle()}>{f.label}</th>)}
                <th style={thStyle()}>שלב</th>
                {data.extraFields.map((f) => <th key={f.key} style={thStyle()}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <DataGridRow
                  key={row.departmentRowId}
                  row={row}
                  workspaceId={workspaceId}
                  baseFields={data.baseFields}
                  extraFields={data.extraFields}
                  pipeline={data.pipeline}
                />
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 14 }}>אין אנשי קשר במחלקה זו</div>}
        </div>
      )}
    </div>
  );
}

function selectStyle() {
  return { border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };
}

function modeBtnStyle(active) {
  return {
    border: 'none', background: active ? '#0a0a0a' : 'var(--bg)', color: active ? '#fff' : 'var(--text-secondary)',
    padding: '7px 12px', fontSize: 12, cursor: 'pointer',
  };
}

function pageBtnStyle() {
  return { border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' };
}

function thStyle() {
  return { textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 10px', textTransform: 'uppercase', whiteSpace: 'nowrap' };
}
