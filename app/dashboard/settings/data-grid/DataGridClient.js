'use client';

import { useEffect, useState, useTransition } from 'react';
import DataGridRow from './DataGridRow';
import { fetchGridRows } from './actions';
import { createField } from '../fields/actions';
import { COMPUTED_FORMULAS } from '../../lib/computedFields';

const PAGE_SIZE = 100;
const COLUMN_TYPES = [
  { value: 'text', label: 'טקסט' },
  { value: 'number', label: 'מספר' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'בחירה מרשימה' },
  { value: 'computed', label: 'מחושב (אוטומטי)' },
];

export default function DataGridClient({ workspaces = [] }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || '');
  const [mode, setMode] = useState('paged'); // 'paged' | 'all'
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null); // { rows, totalCount, baseFields, extraFields, pipeline }
  const [error, setError] = useState(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadRows() {
    if (!workspaceId) return;
    setError(null);
    startTransition(async () => {
      const opts = mode === 'all' ? { all: true } : { page, pageSize: PAGE_SIZE };
      const res = await fetchGridRows(workspaceId, opts);
      if (res?.error) { setError(res.error); setData(null); return; }
      setData(res);
    });
  }

  useEffect(() => {
    loadRows();
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

        <button type="button" onClick={() => setAddingColumn((v) => !v)} style={{ ...pageBtnStyle(), marginInlineStart: 'auto' }}>
          {addingColumn ? 'ביטול' : '+ הוספת עמודה'}
        </button>
      </div>

      {addingColumn && data && (
        <AddColumnForm
          workspaceId={workspaceId}
          existingExtraFields={data.extraFields}
          onDone={() => { setAddingColumn(false); loadRows(); }}
        />
      )}

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

// טופס "+ הוספת עמודה" - מקוצר וזהה בעיקרון לטופס יצירת שדה בהגדרות ←
// שדות מחלקתיים (createField הקיים, אותה הרשאה בדיוק - isManagerOfWorkspace
// למחלקה הנבחרת, בלי עטיפה נוספת). אחרי יצירה - טעינה חוזרת של שורות
// הגריד בלבד (לא רענון עמוד מלא) כדי שהעמודה החדשה תופיע מיד.
function AddColumnForm({ workspaceId, existingExtraFields, onDone }) {
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [optionsText, setOptionsText] = useState('');
  const [formula, setFormula] = useState(COMPUTED_FORMULAS[0]?.value || '');
  const [dateField, setDateField] = useState('');
  const [durationField, setDurationField] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  const dateFields = existingExtraFields.filter((f) => f.type === 'date');
  const numberFields = existingExtraFields.filter((f) => f.type === 'number');
  const computedMissingDeps = type === 'computed' && (!dateField || !durationField);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      let options = [];
      if (type === 'select') options = optionsText.split(',').map((s) => s.trim()).filter(Boolean);
      else if (type === 'computed') options = { formula, dateField, durationField };

      const res = await createField(workspaceId, { fieldKey, label, type, options });
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div style={{ background: 'var(--bg-secondary, #f9f9f9)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input placeholder="מפתח טכני (אנגלית)" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} style={{ ...selectStyle(), width: 200 }} />
        <input placeholder="תווית" value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...selectStyle(), width: 160 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle()}>
          {COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {type === 'select' && (
          <input placeholder="אפשרויות, מופרדות בפסיק" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} style={{ ...selectStyle(), width: 220 }} />
        )}
        {type === 'computed' && (
          <>
            <select value={dateField} onChange={(e) => setDateField(e.target.value)} style={selectStyle()}>
              <option value="">שדה תאריך...</option>
              {dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select value={durationField} onChange={(e) => setDurationField(e.target.value)} style={selectStyle()}>
              <option value="">שדה משך (שנים)...</option>
              {numberFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </>
        )}
        <button type="button" onClick={handleCreate} disabled={isPending || !fieldKey.trim() || !label.trim() || computedMissingDeps}
          style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 12.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'הוספה'}
        </button>
      </div>
      {type === 'computed' && (dateFields.length === 0 || numberFields.length === 0) && (
        <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 8 }}>
          שדה מחושב דורש שכבר יהיו במחלקה זו שדה מסוג "תאריך" ושדה מסוג "מספר" - יש ליצור אותם קודם.
        </div>
      )}
      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>{error}</div>}
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
