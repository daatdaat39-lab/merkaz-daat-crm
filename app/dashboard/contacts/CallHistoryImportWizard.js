'use client';

// ייבוא היסטוריית שיחות מאקסל (שם, מועד שיחה אחרונה, תגובת הלקוח).
// בשונה מייבוא אנשי קשר - כאן לא נוצרים כרטיסים חדשים; כל שורה חייבת
// להתחבר לאיש קשר קיים. שורות עם התאמה ודאית (טלפון/מייל זהים, או שם
// זהה לחלוטין ויחיד) נכנסות אוטומטית; כל ספק עולה למסך אישור ידני
// זוג-זוג לפני שנכתב משהו למסד.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { getContactsForMatching, importCallHistory } from './actions';
import { findMatchesForName } from '../lib/findDuplicates';

const CALL_FIELDS = [
  { key: 'name', label: 'שם' },
  { key: 'phone', label: 'טלפון' },
  { key: 'email', label: 'מייל' },
  { key: 'callDate', label: 'מועד שיחה אחרונה' },
  { key: 'responseText', label: 'תגובת הלקוח' },
];

export default function CallHistoryImportWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('upload'); // upload | map | resolve | done
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [sourceSystem, setSourceSystem] = useState('');
  const [autoMatched, setAutoMatched] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState(null);
  const router = useRouter();

  function resetAll() {
    setOpen(false); setStep('upload'); setHeaders([]); setDataRows([]); setMapping({});
    setSourceSystem(''); setAutoMatched([]); setConflicts([]); setConflictIndex(0);
    setUnmatchedCount(0); setResult(null);
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
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
      } catch {
        setResult({ error: 'לא הצלחתי לקרוא את הקובץ — ודאו שזהו קובץ Excel/CSV תקין' });
        return;
      }
      const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim()));
      if (nonEmpty.length < 2) { setResult({ error: 'לא נמצאו שורות נתונים בקובץ' }); return; }
      setHeaders(nonEmpty[0].map((h) => String(h || '').trim()));
      setDataRows(nonEmpty.slice(1));
      setStep('map');
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function handleMatch() {
    if (!Object.values(mapping).includes('name')) {
      setResult({ error: 'יש למפות עמודה לשדה "שם"' });
      return;
    }
    setIsPending(true);
    setResult(null);
    const res = await getContactsForMatching();
    setIsPending(false);
    if (res?.error) { setResult({ error: res.error }); return; }

    const contacts = res.contacts || [];
    const auto = [];
    const conflictList = [];
    let unmatched = 0;

    dataRows.forEach((cells, idx) => {
      const row = {};
      headers.forEach((h, i) => {
        const target = mapping[h];
        if (!target || target === 'ignore') return;
        row[target] = String(cells[i] ?? '').trim();
      });
      if (!row.name && !row.phone && !row.email) return;

      // מפתח ייחודי לשורה - מונע כפילות בייבוא חוזר של אותו קובץ
      const rowKey = `${sourceSystem || 'שיחות'}|${row.name || ''}|${row.callDate || ''}|${idx}`;
      const match = findMatchesForName(row, contacts);

      if (match.certain) {
        auto.push({ ...row, rowKey, contactId: match.certain.id, contactName: `${match.certain.first || ''} ${match.certain.last || ''}`.trim() });
      } else if (match.candidates?.length) {
        conflictList.push({ ...row, rowKey, candidates: match.candidates });
      } else {
        unmatched++;
      }
    });

    setAutoMatched(auto);
    setConflicts(conflictList);
    setConflictIndex(0);
    setUnmatchedCount(unmatched);
    setStep(conflictList.length > 0 ? 'resolve' : 'confirm');
  }

  function resolveCurrent(contactId) {
    const current = conflicts[conflictIndex];
    if (contactId) {
      setAutoMatched((prev) => [...prev, { ...current, contactId }]);
    }
    const remaining = conflicts.filter((_, i) => i !== conflictIndex);
    setConflicts(remaining);
    if (remaining.length === 0) setStep('confirm');
    else setConflictIndex(Math.min(conflictIndex, remaining.length - 1));
  }

  async function handleImport() {
    setIsPending(true);
    setResult(null);
    const res = await importCallHistory(autoMatched.map((r) => ({ ...r, sourceSystem })));
    setIsPending(false);
    setResult(res);
    if (res?.success) { setStep('done'); router.refresh(); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={ghostBtn()}>
        📞 ייבוא היסטוריית שיחות
      </button>
    );
  }

  const current = conflicts[conflictIndex];

  return (
    <div style={overlay()}>
      <div style={dialog()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>ייבוא היסטוריית שיחות</h2>
          <button type="button" onClick={resetAll} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        {step === 'upload' && (
          <div>
            <p style={hint()}>בחרו קובץ Excel/CSV עם שמות, מועד שיחה אחרונה ותגובת הלקוח. השורה הראשונה חייבת להיות שורת כותרות.</p>
            <p style={note()}>שימו לב: ייבוא זה <b>לא יוצר אנשי קשר חדשים</b> — כל שורה מחוברת לאיש קשר שכבר קיים במערכת. שורה שלא נמצאה לה התאמה תדווח ותדולג.</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
            {result?.error && <p style={errText()}>{result.error}</p>}
          </div>
        )}

        {step === 'map' && (
          <div>
            <p style={hint()}>מיפוי עמודות — {dataRows.length} שורות זוהו. חובה למפות לפחות "שם".</p>
            <label style={label()}>שם המערכת שממנה הגיע הקובץ (אופציונלי)</label>
            <input type="text" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} placeholder="מוקד טלפוני" style={input()} />
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 10, marginTop: 8 }}>
              {headers.map((h) => (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }} title={h}>{h || '(ללא כותרת)'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>←</span>
                  <select value={mapping[h] || 'ignore'} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))} style={{ ...input(), width: 200, marginBottom: 0 }}>
                    <option value="ignore">— התעלם —</option>
                    {CALL_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {result?.error && <p style={errText()}>{result.error}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" onClick={() => setStep('upload')} style={ghostBtn()}>חזרה</button>
              <button type="button" onClick={handleMatch} disabled={isPending} style={primaryBtn()}>
                {isPending ? 'מתאים...' : 'התאמה לאנשי קשר'}
              </button>
            </div>
          </div>
        )}

        {step === 'resolve' && current && (
          <div>
            <p style={hint()}>
              אישור התאמה — נותרו {conflicts.length} שורות מעורפלות. לשורה הזו נמצאה יותר מהתאמה אפשרית אחת, או שההתאמה אינה מדויקת.
              <b> שום דבר לא נכתב עד שתאשרו.</b>
            </p>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>השורה מהקובץ:</div>
              <div>{current.name || '(ללא שם)'}</div>
              {current.phone && <div style={{ color: '#6b6b6b' }}>טלפון: {current.phone}</div>}
              {current.callDate && <div style={{ color: '#6b6b6b' }}>מועד שיחה: {current.callDate}</div>}
              {current.responseText && <div style={{ color: '#6b6b6b' }}>תגובה: {current.responseText}</div>}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b6b6b', marginBottom: 6 }}>לאיזה איש קשר זה שייך?</div>
            {current.candidates.map(({ contact, score }) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => resolveCurrent(contact.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'right', background: '#fff',
                  border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 12px',
                  marginBottom: 6, cursor: 'pointer', fontSize: 13,
                }}
              >
                <b>{contact.first} {contact.last}</b>
                <span style={{ color: '#9b9b9b' }}> {contact.phone || contact.email || ''}</span>
                <span style={{ color: '#15803d', fontSize: 11, marginInlineStart: 6 }}>התאמה {Math.round(score * 100)}%</span>
              </button>
            ))}
            <button type="button" onClick={() => resolveCurrent(null)} style={{ ...ghostBtn(), marginTop: 6 }}>
              ✕ אף אחד מאלה — דלג על השורה
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <p style={hint()}>סיכום לפני הכתיבה:</p>
            <ul style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              <li><b>{autoMatched.length}</b> שורות שויכו לאנשי קשר ויוכנסו</li>
              {unmatchedCount > 0 && <li>{unmatchedCount} שורות ללא התאמה — ידולגו</li>}
            </ul>
            {result?.error && <p style={errText()}>{result.error}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" onClick={resetAll} style={ghostBtn()}>ביטול</button>
              <button type="button" onClick={handleImport} disabled={isPending || autoMatched.length === 0} style={primaryBtn()}>
                {isPending ? 'מייבא...' : `ייבוא ${autoMatched.length} שורות`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result?.success && (
          <div>
            <p style={{ fontSize: 15 }}>✓ הייבוא הושלם</p>
            <ul style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              <li>{result.added} שיחות נוספו להיסטוריה</li>
              {result.skipped > 0 && <li>{result.skipped} דולגו — כבר קיימות מייבוא קודם</li>}
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
  return { padding: '8px 16px', borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: 'var(--accent, #1f4d3d)', color: '#fff', border: 'none' };
}
function overlay() {
  return { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
}
function dialog() {
  return { background: 'var(--card-bg, #fff)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' };
}
function hint() { return { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }; }
function note() { return { fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }; }
function label() { return { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }; }
function input() { return { width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13.5, marginBottom: 6, boxSizing: 'border-box' }; }
function errText() { return { color: 'var(--red, #b23b2f)', fontSize: 13, marginTop: 10 }; }
