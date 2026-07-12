'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importContacts } from './actions';

const COLUMNS = ['first', 'last', 'idnum', 'phone', 'phone2', 'email', 'dept', 'source', 'reason', 'tags'];
const HEADERS_HE = ['שם פרטי', 'שם משפחה', 'ת"ז', 'טלפון', 'טלפון נוסף', 'מייל', 'תחום', 'מקור', 'מהות הפנייה', 'תגיות (מופרדות בפסיק)'];

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    COLUMNS.forEach((col, idx) => { row[col] = cells[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DownloadTemplateButton() {
  function handleClick() {
    const csv = '﻿' + HEADERS_HE.join(',') + '\n' + 'ישראל,ישראלי,123456789,050-1234567,,israel@example.com,לימודי,הפניה,התעניינות ברישום לקורס,לקוח פוטנציאלי\n';
    downloadBlob(csv, 'תבנית-ייבוא-אנשי-קשר.csv', 'text/csv;charset=utf-8;');
  }
  return (
    <button type="button" onClick={handleClick} style={ghostBtn()}>
      📄 הורדת קובץ לדוגמה
    </button>
  );
}

export function ExportContactsButton({ contacts }) {
  function handleClick() {
    const rows = contacts.map((c) => [
      c.first || '', c.last || '', c.idnum || '', c.phone || '', c.phone2 || '', c.email || '', c.dept || '', c.source || '', (c.tags || []).join('; '),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '﻿' + [HEADERS_HE.join(','), ...rows].join('\n');
    downloadBlob(csv, `אנשי-קשר-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  }
  return (
    <button type="button" onClick={handleClick} style={ghostBtn()}>
      ⬇ ייצוא לאקסל
    </button>
  );
}

export function ImportContactsButton({ workspaces = [], defaultWorkspaceId = '' }) {
  const fileRef = useRef(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const router = useRouter();

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result));
      if (rows.length === 0) {
        setResult({ error: 'לא נמצאו שורות תקינות בקובץ. יש להשתמש בקובץ לדוגמה כתבנית.' });
        return;
      }
      startTransition(async () => {
        const res = await importContacts(rows, workspaceId);
        setResult(res);
        if (res.success) router.refresh();
      });
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {workspaces.length > 0 && (
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 }}
        >
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      <button type="button" onClick={() => fileRef.current?.click()} disabled={isPending} style={ghostBtn()}>
        {isPending ? 'מייבא...' : '⬆ ייבוא מאקסל (CSV)'}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
      {result?.success && (
        <span style={{ fontSize: 12, color: 'var(--green, #2f7d4f)' }}>
          ✓ {result.created} נוצרו{result.merged > 0 ? `, ${result.merged} אוחדו עם קיימים` : ''}
        </span>
      )}
      {result?.error && <span style={{ fontSize: 12, color: 'var(--red, #b23b2f)' }}>שגיאה: {result.error}</span>}
    </div>
  );
}

function ghostBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}
