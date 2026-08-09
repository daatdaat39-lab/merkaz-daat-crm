'use client';

import { useEffect, useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import DataGridRow from './DataGridRow';
import { fetchGridRows, fetchAllContactIds, exportGridContacts } from './actions';
import { createField } from '../fields/actions';
import { COMPUTED_FORMULAS } from '../../lib/computedFields';
import { generateFieldKey } from '../../lib/fieldKey';
import AiFieldWizard from '../../components/AiFieldWizard';

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
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isExporting, setIsExporting] = useState(false);
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
    setSelectedIds(new Set());
  }

  function handleModeChange(newMode) {
    setMode(newMode);
    setPage(1);
  }

  function toggleSelected(contactId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  // "בחירת הכל" בוחרת את כל אנשי הקשר המתאימים בכל העמודים (לא רק את
  // העמוד שכבר נטען) - שולפת את כל המזהים משרת בנפרד מ-data.rows.
  function toggleSelectAll() {
    if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }
    startTransition(async () => {
      const res = await fetchAllContactIds(workspaceId);
      if (res?.error) { setError(res.error); return; }
      setSelectedIds(new Set(res.contactIds));
    });
  }

  function handleExport() {
    setIsExporting(true);
    startTransition(async () => {
      const res = await exportGridContacts(workspaceId, Array.from(selectedIds));
      setIsExporting(false);
      if (res?.error) { setError(res.error); return; }
      downloadExport(res);
    });
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

        {selectedIds.size > 0 && (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>✓ {selectedIds.size} נבחרו</span>
            <button type="button" onClick={handleExport} disabled={isExporting} style={pageBtnStyle()}>
              {isExporting ? 'מייצא...' : '⬇ ייצוא נבחרים'}
            </button>
          </>
        )}

        <button type="button" onClick={() => { setAddingColumn((v) => !v); setAiWizardOpen(false); }} style={{ ...pageBtnStyle(), marginInlineStart: 'auto' }}>
          {addingColumn ? 'ביטול' : '+ הוספת עמודה'}
        </button>
        <button type="button" onClick={() => { setAiWizardOpen((v) => !v); setAddingColumn(false); }} style={pageBtnStyle()}>
          {aiWizardOpen ? 'ביטול' : '🤖 עם AI'}
        </button>
      </div>

      {aiWizardOpen && data && (
        <AiFieldWizard
          workspaceId={workspaceId}
          onCreated={() => { setAiWizardOpen(false); loadRows(); }}
          onClose={() => setAiWizardOpen(false)}
        />
      )}

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
                <th style={thStyle()}>
                  <input
                    type="checkbox"
                    checked={data && selectedIds.size >= data.totalCount && selectedIds.size > 0}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && (!data || selectedIds.size < data.totalCount); }}
                    onChange={toggleSelectAll}
                    title="בחירת הכל"
                  />
                </th>
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
                  selected={selectedIds.has(row.contactId)}
                  onToggleSelected={() => toggleSelected(row.contactId)}
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
        <button
          type="button"
          onClick={() => setFieldKey(generateFieldKey(existingExtraFields.map((f) => f.key)))}
          title="יצירת מפתח טכני אוטומטי שעדיין לא תפוס"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          🎲 אוטומטי
        </button>
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

// בונה קובץ Excel אחד עם 3 לשוניות מתוצאת exportGridContacts - אנשי
// קשר (בסיס + שדות נוספים), תרומות, והתחייבויות, כל אחד עם עמודת שם+ת.ז
// לזיהוי כדי שאפשר יהיה לצלוב בין הלשוניות בלי להסתמך על contact_id
// גולמי. xlsx (SheetJS) כבר תלות קיימת בפרויקט (משמשת לייבוא בקבצי
// DepartmentImportWizard.js/CallHistoryImportWizard.js) - כאן בשימוש
// גם לכתיבה (aoa_to_sheet + writeFile), לא רק לקריאה.
function downloadExport({ contacts, memberships, extraFields, transactions, commitments }) {
  const today = new Date().toISOString().slice(0, 10);
  const membershipByContact = new Map(memberships.map((m) => [m.contact_id, m]));
  const nameById = new Map(contacts.map((c) => [c.id, `${c.first || ''} ${c.last || ''}`.trim()]));

  const contactHeaders = [
    'שם פרטי', 'שם משפחה', 'ת"ז', 'טלפון', 'טלפון נוסף', 'מייל', 'מייל נוסף', 'מקור', 'תאריך לידה', 'מגדר',
    'עיר', 'רחוב', 'מספר בית', 'דירה', 'מיקוד', 'שכונה', 'מדינה', 'מספר ילדים', 'תגיות', 'שלב',
    ...extraFields.map((f) => f.label),
  ];
  const contactRows = contacts.map((c) => {
    const membership = membershipByContact.get(c.id);
    const extra = membership?.extra_fields || {};
    return [
      c.first, c.last, c.idnum, c.phone, c.phone2, c.email, c.email2, c.source, c.birth_date, c.gender,
      c.city, c.street, c.house_number, c.apartment, c.zip_code, c.neighborhood, c.country, c.children_count,
      (c.tags || []).join('; '), membership?.stage,
      ...extraFields.map((f) => extra[f.key]),
    ];
  });

  const transactionHeaders = ['שם איש קשר', 'ת"ז', 'סכום', 'תאריך', 'מקור', 'ייעוד', 'אמצעי תשלום', 'סוג עסקה', 'אסמכתא קמפיין', 'גורם מגייס', 'מספר מסמך', 'קישור קבלה'];
  const transactionRows = transactions.map((t) => {
    const contact = contacts.find((c) => c.id === t.contact_id);
    return [
      nameById.get(t.contact_id), contact?.idnum, t.amount, t.transaction_date, t.source_system, t.designation,
      t.payment_method, t.transaction_type, t.campaign_reference, t.fundraiser_name, t.external_doc_number, t.receipt_url,
    ];
  });

  const commitmentHeaders = ['שם איש קשר', 'ת"ז', 'סכום', 'סטטוס', 'תדירות', 'תאריך התחלה', 'תאריך סיום', 'אסמכתא', 'ייעוד', 'אמצעי תשלום', 'תשלום אחרון', 'ערוץ מקור', 'חזרות', 'הערה', 'נוצר בתאריך'];
  const commitmentRows = commitments.map((c) => {
    const contact = contacts.find((x) => x.id === c.contact_id);
    return [
      nameById.get(c.contact_id), contact?.idnum, c.total_amount, c.status, c.frequency, c.start_date, c.end_date,
      c.external_reference, c.designation, c.payment_method, c.last_payment_status, c.source_channel, c.bounced_count, c.note, c.created_at,
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([contactHeaders, ...contactRows]), 'אנשי קשר');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([transactionHeaders, ...transactionRows]), 'תרומות');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([commitmentHeaders, ...commitmentRows]), 'התחייבויות');
  XLSX.writeFile(wb, `אנשי-קשר-מלא-${today}.xlsx`);
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
