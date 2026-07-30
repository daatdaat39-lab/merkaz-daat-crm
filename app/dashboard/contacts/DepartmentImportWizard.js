'use client';

// אשף ייבוא אקסל למחלקה ספציפית (בעיקר תרומות) ממערכות חיצוניות (כמו
// "קשר") - בשונה מ-ImportContactsButton (CSV בפורמט קבוע), כאן: קובץ
// אקסל/CSV עם כותרות חופשיות שממופות ידנית לשדות המערכת, וכל השורות
// מתויגות במקור (שם המערכת) ובתקופה - כדי שאפשר יהיה תמיד לדעת מאיפה
// ומתי הגיע כל פרט. עקרון-העל של importDepartmentBatch: לעולם לא דורס
// שדה קיים, לעולם לא מוחק - רק יוצר או מעשיר.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { importDepartmentBatch } from './actions';
import { getExtraFields } from '../components/pipelines';

const BASE_FIELDS = [
  { key: 'first', label: 'שם פרטי' },
  { key: 'last', label: 'שם משפחה' },
  { key: 'phone', label: 'טלפון' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'email', label: 'מייל' },
  { key: 'email2', label: 'מייל נוסף' },
  { key: 'idnum', label: 'ת"ז' },
  { key: 'birth_date', label: 'תאריך לידה' },
  { key: 'gender', label: 'מגדר' },
  { key: 'tags', label: 'תגיות (מופרדות בפסיק)' },
];

function mappingStorageKey(systemName) {
  return `crm-import-mapping::${systemName.trim().toLowerCase()}`;
}

export default function DepartmentImportWizard({ workspaces = [], defaultWorkspaceId = '' }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('upload'); // upload | classify | map | done
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [systemName, setSystemName] = useState('');
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [batchLabel, setBatchLabel] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState(null);
  const router = useRouter();

  const workspace = workspaces.find((w) => w.id === workspaceId);
  const extraFields = useMemo(() => (workspace ? getExtraFields(workspace.name) : []), [workspace]);

  function resetAll() {
    setOpen(false); setStep('upload'); setHeaders([]); setDataRows([]);
    setMapping({}); setSystemName(''); setBatchLabel(''); setResult(null);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let rows;
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      } catch (err) {
        setResult({ error: 'לא הצלחתי לקרוא את הקובץ - ודאו שזהו קובץ Excel/CSV תקין' });
        return;
      }
      const nonEmptyRows = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim()));
      if (nonEmptyRows.length < 2) {
        setResult({ error: 'לא נמצאו שורות נתונים בקובץ (רק כותרת, או קובץ ריק)' });
        return;
      }
      setHeaders(nonEmptyRows[0].map((h) => String(h || '').trim()));
      setDataRows(nonEmptyRows.slice(1));
      setStep('classify');
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function applySystemName(name) {
    setSystemName(name);
    if (!name.trim()) return;
    try {
      const saved = JSON.parse(localStorage.getItem(mappingStorageKey(name)) || 'null');
      if (saved) setMapping(saved);
    } catch { /* מיפוי שמור לא תקין - מתעלמים, לא חוסם */ }
  }

  function handleSubmit() {
    if (!workspaceId) { setResult({ error: 'יש לבחור מחלקת יעד' }); return; }
    if (!Object.values(mapping).includes('first')) {
      setResult({ error: 'יש למפות לפחות עמודה אחת לשדה "שם פרטי"' });
      return;
    }

    if (systemName.trim()) {
      try { localStorage.setItem(mappingStorageKey(systemName), JSON.stringify(mapping)); } catch { /* לא קריטי */ }
    }

    const rows = dataRows.map((cells) => {
      const row = { extraFields: {} };
      headers.forEach((h, idx) => {
        const target = mapping[h];
        if (!target || target === 'ignore') return;
        const value = String(cells[idx] ?? '').trim();
        if (!value) return;
        if (target.startsWith('extra:')) row.extraFields[target.slice(6)] = value;
        else row[target] = value;
      });
      return row;
    });

    setIsPending(true);
    setResult(null);
    importDepartmentBatch(rows, workspaceId, systemName.trim() || null, batchLabel.trim() || null).then((res) => {
      setIsPending(false);
      setResult(res);
      if (res.success) { setStep('done'); router.refresh(); }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={ghostBtn()}>
        📥 ייבוא ממערכת חיצונית
      </button>
    );
  }

  return (
    <div style={overlay()}>
      <div style={dialog()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>ייבוא אנשי קשר ממערכת חיצונית</h2>
          <button type="button" onClick={resetAll} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        {step === 'upload' && (
          <div>
            <p style={hint()}>שלב 1 מתוך 3: בחרו קובץ Excel (.xlsx) או CSV. השורה הראשונה בקובץ חייבת להכיל כותרות עמודה.</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
          </div>
        )}

        {step === 'classify' && (
          <div>
            <p style={hint()}>שלב 2 מתוך 3: לאיזו מחלקה שייך הקובץ הזה, ומאיזו מערכת/תקופה הוא הגיע?</p>
            <label style={label()}>מחלקת יעד</label>
            <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={input()}>
              <option value="">בחרו מחלקה...</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <label style={label()}>שם המערכת המקורית (למשל: קשר, יעד, ידני)</label>
            <input type="text" value={systemName} onChange={(e) => applySystemName(e.target.value)} placeholder="קשר" style={input()} />
            <label style={label()}>תקופה/תאריך לתיוג (למשל: מרץ 2026)</label>
            <input type="text" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="מרץ 2026" style={input()} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <button type="button" onClick={() => setStep('upload')} style={ghostBtn()}>חזרה</button>
              <button type="button" onClick={() => setStep('map')} disabled={!workspaceId} style={primaryBtn()}>המשך למיפוי עמודות</button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div>
            <p style={hint()}>שלב 3 מתוך 3: לכל עמודה שזוהתה בקובץ, בחרו לאיזה שדה במערכת היא שייכת. עמודה שלא נבחר לה שדה תתעלם ממנה. {dataRows.length} שורות נתונים זוהו.</p>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              {headers.map((h) => (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }} title={h}>{h || '(ללא כותרת)'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>←</span>
                  <select value={mapping[h] || 'ignore'} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))} style={{ ...input(), width: 220, marginBottom: 0 }}>
                    <option value="ignore">— התעלם מהעמודה —</option>
                    {BASE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    {extraFields.length > 0 && (
                      <optgroup label={`שדות ${workspace?.name || ''}`}>
                        {extraFields.map((f) => <option key={f.key} value={`extra:${f.key}`}>{f.label}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
            </div>
            {result?.error && <p style={{ color: 'var(--red, #b23b2f)', fontSize: 13, marginTop: 10 }}>{result.error}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <button type="button" onClick={() => setStep('classify')} style={ghostBtn()}>חזרה</button>
              <button type="button" onClick={handleSubmit} disabled={isPending} style={primaryBtn()}>
                {isPending ? 'מייבא...' : `ייבוא ${dataRows.length} שורות`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result?.success && (
          <div>
            <p style={{ fontSize: 15 }}>✓ הייבוא הושלם — <b>שום נתון קיים לא נמחק או נדרס.</b></p>
            <ul style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              <li>{result.created} אנשי קשר חדשים נוצרו</li>
              <li>{result.enriched} אנשי קשר קיימים הועשרו (שדות ריקים הושלמו, נוספה רשומת פנייה חדשה להיסטוריה)</li>
            </ul>
            <button type="button" onClick={resetAll} style={primaryBtn()}>סגירה</button>
          </div>
        )}
      </div>
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

function primaryBtn() {
  return {
    padding: '8px 16px', borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    background: 'var(--accent, #1f4d3d)', color: '#fff', border: 'none',
  };
}

function overlay() {
  return {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2500,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  };
}

function dialog() {
  return {
    background: 'var(--card-bg, #fff)', borderRadius: 12, padding: 24,
    width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  };
}

function hint() {
  return { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 };
}

function label() {
  return { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 12, color: 'var(--text-secondary)' };
}

function input() {
  return {
    width: '100%', border: '1px solid var(--border)', borderRadius: 6,
    padding: '8px 10px', fontSize: 13.5, marginBottom: 6, boxSizing: 'border-box',
  };
}
