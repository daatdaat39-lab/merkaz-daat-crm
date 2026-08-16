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
import { createField, splitMultiValueField } from '../settings/fields/actions';
import { generateFieldKey } from '../lib/fieldKey';

const NEW_FIELD_TYPES = [
  { value: 'text', label: 'טקסט' },
  { value: 'number', label: 'מספר' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'בחירה מרשימה' },
];

const BASE_FIELDS = [
  { key: 'first', label: 'שם פרטי' },
  { key: 'last', label: 'שם משפחה' },
  { key: 'phone', label: 'טלפון' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'phone3', label: 'טלפון נוסף 2 (מעבר ל-2 - נכנס ללשונית "טלפונים נוספים" בכרטיס)' },
  { key: 'phone4', label: 'טלפון נוסף 3 (מעבר ל-2 - נכנס ללשונית "טלפונים נוספים" בכרטיס)' },
  { key: 'email', label: 'מייל' },
  { key: 'email2', label: 'מייל נוסף' },
  { key: 'idnum', label: 'ת"ז' },
  { key: 'birth_date', label: 'תאריך לידה' },
  { key: 'gender', label: 'מגדר' },
  { key: 'tags', label: 'תגיות (מופרדות בפסיק)' },
  { key: 'externalId', label: 'מזהה במערכת המקור (למשל מספר לקוח בקשר)' },
  { key: 'city', label: 'עיר' },
  { key: 'street', label: 'רחוב' },
  { key: 'house_number', label: 'מספר בית' },
  { key: 'apartment', label: 'דירה' },
  { key: 'zip_code', label: 'מיקוד' },
  { key: 'neighborhood', label: 'שכונה' },
  { key: 'country', label: 'מדינה' },
];

// שדות תנועה (לא תמונת מצב) - כשממופים amount+date, כל שורה הופכת
// לרשומה נפרדת בהיסטוריית התנועות (donation_transactions, שם הטבלה
// נשאר היסטורי אבל השדה workspace_id גנרי לגמרי) - זמין לכל מחלקה,
// לא רק תרומות (ר' insertDonationTransaction ב-leadIntakeCore.js -
// לא הייתה שם הגבלה, רק ב-UI כאן).
const TXN_FIELDS = [
  { key: 'txn:amount', label: 'סכום (תנועה בודדת)' },
  { key: 'txn:date', label: 'תאריך (תנועה בודדת)' },
  { key: 'txn:docNumber', label: 'מספר מסמך/תנועה' },
  { key: 'txn:designation', label: 'ייעוד התרומה' },
  { key: 'txn:payment_method', label: 'אופן תשלום' },
  { key: 'txn:transaction_type', label: 'סוג פעולה/מסמך' },
  { key: 'txn:campaign_reference', label: 'הפניית קמפיין (חופשי)' },
  { key: 'txn:fundraiser_name', label: 'סוכן לזיכוי' },
  { key: 'txn:payment_method_type', label: 'אופן תשלום (סוג - אשראי/העברה/צ׳ק/מזומן)' },
  { key: 'txn:payment_card_last4', label: '4 ספרות אחרונות של כרטיס אשראי' },
  { key: 'txn:payment_bank_account', label: 'מספר חשבון בנק' },
  { key: 'txn:source', label: 'מקור התנועה (למשל: הפעלת בילינג / ידני)' },
  { key: 'txn:payment_status', label: 'סטטוס תשלום (ריק/"תקין" = הצליח, כל ערך אחר = נכשל)' },
];

// שדות ברמת הוראת קבע/התחייבות (לא תנועה בודדת) - כשעמודה ממופה ל-
// commit:ref, כל השורות שחולקות אותו ערך גולמי באותה עמודה (לאותו איש
// קשר) מתאחדות לשורת commitments אחת בלבד, וכל שורה נשארת גם תנועה
// (donation_transactions) נפרדת המקושרת אליה דרך commitment_id - ר'
// resolveCommitment ב-leadIntakeCore.js. בלי מיפוי commit:ref, שום
// דבר כאן לא משפיע - כל שורה ממשיכה להיות תנועה עצמאית כמו היום.
const COMMIT_FIELDS = [
  { key: 'commit:ref', label: 'אסמכתא הוראת קבע/התחייבות' },
  { key: 'commit:total_amount', label: 'סכום כולל להתחייבות' },
  { key: 'commit:installments_count', label: 'מספר תשלומים כולל' },
  { key: 'commit:start_date', label: 'תאריך התחלת ההתחייבות' },
  { key: 'commit:end_date', label: 'תאריך סיום ההתחייבות' },
  { key: 'commit:designation', label: 'ייעוד ההתחייבות' },
  { key: 'commit:cancelled_flag', label: 'דגל ביטול (כל ערך שאינו ריק/0 = בוטלה)' },
  { key: 'commit:frozen_flag', label: 'דגל הקפאה (כל ערך שאינו ריק/0 = מוקפאת)' },
];

function mappingStorageKey(systemName) {
  return `crm-import-mapping::${systemName.trim().toLowerCase()}`;
}

// מנרמל תאריך DD/MM/YYYY (פורמט נפוץ בקבצי ייצוא ישראליים) לפני פענוח -
// אותה היוריסטיקה בדיוק שכבר קיימת ומאומתת ב-safeDate (kesherSyncActions.js);
// כפול פה כי זהו קובץ 'use client' ואי אפשר לייבא פונקציה לא-מיוצאת
// מקובץ 'use server'. תאריך שלא ניתן לפרסר מחזיר null - לא חוסם ייבוא,
// ר' השימוש למטה.
function parseRowDate(raw) {
  const s = (raw || '').toString().trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function DepartmentImportWizard({ workspaces = [], defaultWorkspaceId = '', extraFieldsByWorkspaceName = {}, stagesByWorkspaceName = {} }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('upload'); // upload | classify | map | done
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [systemName, setSystemName] = useState('');
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [batchLabel, setBatchLabel] = useState('');
  const [openProcess, setOpenProcess] = useState(false);
  const [skipFutureDates, setSkipFutureDates] = useState(true);
  const [futureSkipped, setFutureSkipped] = useState(0);
  // זיהוי אוטומטי של הוראות קבע מתוך תנועות חוזרות (בקבצים בלי עמודת
  // אסמכתא הוראת-קבע מוכנה, כמו "מערכת עסקים") - ר' commitmentClustering.js.
  // billingSourceValue/successStatusValuesText ניתנים לעריכה (לא קבועים
  // בקוד) כי קובץ ייצוא אחר מאותה מערכת עשוי להשתמש בערכי טקסט שונים.
  const [autoDetectCommitments, setAutoDetectCommitments] = useState(false);
  const [billingSourceValue, setBillingSourceValue] = useState('הפעלת בילינג');
  const [successStatusValuesText, setSuccessStatusValuesText] = useState('תקין');
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState(null);
  // מיפוי ערכי סטטוס חופשיים מהקובץ לשלב פייפליין אמיתי, כשעמודה
  // ממופה ליעד 'stage' - { [שם עמודה]: { [ערך גולמי]: stage_key } }
  const [stageValueMaps, setStageValueMaps] = useState({});
  // שדות חדשים שנוצרו דרך "+ שדה חדש" באשף עצמו, בלי לצאת ממנו - נוספים
  // לרשימת השדות הזמינה למיפוי מיד, בלי רענון עמוד (שהיה מאבד את הקובץ
  // שכבר נטען).
  const [addedFields, setAddedFields] = useState([]);
  const [addingField, setAddingField] = useState(false);
  const router = useRouter();

  const workspace = workspaces.find((w) => w.id === workspaceId);
  // שדה "מחושב" מוצג בכל מקום אחר לקריאה בלבד - אי אפשר לייבא ערך
  // לתוכו, לכן מוסתר מרשימת המיפוי כאן.
  const extraFields = useMemo(
    () => (workspace ? [...(extraFieldsByWorkspaceName[workspace.name] || []).filter((f) => f.type !== 'computed'), ...addedFields] : []),
    [workspace, extraFieldsByWorkspaceName, addedFields]
  );
  const stages = useMemo(
    () => (workspace ? (stagesByWorkspaceName[workspace.name] || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []),
    [workspace, stagesByWorkspaceName]
  );

  function distinctValuesForHeader(header) {
    const idx = headers.indexOf(header);
    if (idx === -1) return [];
    const set = new Set();
    dataRows.forEach((cells) => {
      const v = String(cells[idx] ?? '').trim();
      if (v) set.add(v);
    });
    return Array.from(set);
  }

  function defaultStageForValue(rawValue) {
    const match = stages.find((s) => (s.label || '').trim() === rawValue.trim());
    return match ? match.stage_key : (stages[0]?.stage_key || '');
  }

  function stageValueFor(header, rawValue) {
    return stageValueMaps[header]?.[rawValue] || defaultStageForValue(rawValue);
  }

  function setStageValue(header, rawValue, stageKey) {
    setStageValueMaps((m) => ({ ...m, [header]: { ...(m[header] || {}), [rawValue]: stageKey } }));
  }

  function resetAll() {
    setOpen(false); setStep('upload'); setHeaders([]); setDataRows([]);
    setMapping({}); setSystemName(''); setBatchLabel(''); setOpenProcess(false); setSkipFutureDates(true); setFutureSkipped(0); setResult(null); setStageValueMaps({});
    setAutoDetectCommitments(false); setBillingSourceValue('הפעלת בילינג'); setSuccessStatusValuesText('תקין');
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

    let futureSkippedCount = 0;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const rows = dataRows.map((cells) => {
      const row = { extraFields: {}, donationTransaction: {}, commitment: {} };
      const noteParts = [];
      let paymentMethodType = '';
      let paymentCardLast4 = '';
      let paymentBankAccount = '';
      headers.forEach((h, idx) => {
        const target = mapping[h];
        if (!target || target === 'ignore') return;
        const value = String(cells[idx] ?? '').trim();
        if (!value) return;
        if (target.startsWith('extra:')) row.extraFields[target.slice(6)] = value;
        else if (target === 'phone3' || target === 'phone4') {
          // לא הופך לעמודת contacts אמיתית - נאסף בנפרד ומנותב ל-phone/
          // phone2 (אם עדיין ריקים) או ל-contact_phones ("טלפונים נוספים"),
          // ר' phoneRouting.js / leadIntakeCore.js.
          row.additionalPhones = row.additionalPhones || [];
          row.additionalPhones.push({ phone: value, label: h });
        }
        else if (target === 'txn:amount') row.donationTransaction.amount = value;
        else if (target === 'txn:date') row.donationTransaction.date = value;
        else if (target === 'txn:docNumber') row.donationTransaction.docNumber = value;
        else if (target === 'txn:designation') row.donationTransaction.designation = value;
        else if (target === 'txn:payment_method') row.donationTransaction.paymentMethod = value;
        else if (target === 'txn:transaction_type') row.donationTransaction.transactionType = value;
        else if (target === 'txn:campaign_reference') row.donationTransaction.campaignReference = value;
        else if (target === 'txn:fundraiser_name') row.donationTransaction.fundraiserName = value;
        else if (target === 'txn:payment_method_type') paymentMethodType = value;
        else if (target === 'txn:payment_card_last4') paymentCardLast4 = value;
        else if (target === 'txn:payment_bank_account') paymentBankAccount = value;
        else if (target === 'txn:source') row.donationTransaction.source = value;
        else if (target === 'txn:payment_status') row.donationTransaction.paymentStatus = value;
        else if (target === 'commit:ref') row.commitment.externalReference = value;
        else if (target === 'commit:total_amount') row.commitment.totalAmount = value;
        else if (target === 'commit:installments_count') row.commitment.installmentsCount = value;
        else if (target === 'commit:start_date') row.commitment.startDate = value;
        else if (target === 'commit:end_date') row.commitment.endDate = value;
        else if (target === 'commit:designation') row.commitment.designation = value;
        else if (target === 'commit:cancelled_flag') row.commitment.cancelled = value !== '0';
        else if (target === 'commit:frozen_flag') row.commitment.frozen = value !== '0';
        else if (target === 'note') noteParts.push(`${h}: ${value}`);
        else if (target === 'stage') row.stage = stageValueMaps[h]?.[value] || defaultStageForValue(value);
        else row[target] = value;
      });

      const cardOrAccount = paymentCardLast4 ? `****${paymentCardLast4}` : paymentBankAccount;
      const composedPaymentMethod = [paymentMethodType, cardOrAccount].filter(Boolean).join(' ');
      if (composedPaymentMethod) {
        row.donationTransaction.paymentMethod = composedPaymentMethod;
        if (row.commitment.externalReference) row.commitment.paymentMethod = composedPaymentMethod;
      }

      if (skipFutureDates && row.donationTransaction.date) {
        const parsed = parseRowDate(row.donationTransaction.date);
        if (parsed && parsed > endOfToday) { futureSkippedCount++; delete row.donationTransaction; }
      }

      if (!row.donationTransaction.amount || !row.donationTransaction.date) delete row.donationTransaction;
      if (!row.commitment.externalReference) delete row.commitment;
      if (noteParts.length > 0) row.note = noteParts.join('\n');
      return row;
    });

    setFutureSkipped(futureSkippedCount);

    // "לא לרשום תשלום כושל כתרומה" פעיל בכל פעם שעמודת סטטוס תשלום
    // ממופה בכלל - בלי תלות בתיבת "זהה הוראות קבע אוטומטית" (כדי שלא
    // יהיה מצב שממפים סטטוס אבל שוכחים לסמן, ותשלום כושל בכל זאת נכנס
    // כתרומה אמיתית). קיבוץ להתחייבות עצמו כן דורש את התיבה + ערך מקור.
    const paymentStatusMapped = Object.values(mapping).includes('txn:payment_status');
    const autoDetectOption = paymentStatusMapped
      ? {
          successStatusValues: successStatusValuesText.split(',').map((s) => s.trim()),
          billingSourceValue: autoDetectCommitments ? billingSourceValue.trim() : null,
        }
      : null;

    setIsPending(true);
    setResult(null);
    importDepartmentBatch(rows, workspaceId, systemName.trim() || null, batchLabel.trim() || null, openProcess, autoDetectOption).then((res) => {
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={openProcess} onChange={(e) => setOpenProcess(e.target.checked)} />
              לפתוח תהליך/ליד לאנשי קשר חדשים בקובץ הזה
            </label>
            <div style={hint()}>
              השאירו לא מסומן לרשימות של אנשי קשר ותיקים - הם יישמרו ככרטיס בלבד, בלי להופיע ללידים לעבודה.
              סמנו רק כשמדובר בקובץ אמיתי של לידים חדשים שצריך לעבוד עליהם.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={skipFutureDates} onChange={(e) => setSkipFutureDates(e.target.checked)} />
              דלג על תנועות עם תאריך עתידי
            </label>
            <div style={hint()}>
              מומלץ להשאיר מסומן בקבצים היסטוריים - שורה עם תאריך עתידי לא באמת נגבתה, ואולי לעולם לא תיגבה (למשל אם הגבייה עברה למערכת אחרת).
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoDetectCommitments} onChange={(e) => setAutoDetectCommitments(e.target.checked)} />
              לזהות אוטומטית הוראות קבע מתוך תנועות חוזרות (חיוב אוטומטי)
            </label>
            <div style={hint()}>
              מתאים לקבצים בלי עמודת "אסמכתא הוראת קבע" מוכנה (למפות בשלב הבא גם "מקור התנועה" ו"סטטוס תשלום" כדי שזה יעבוד).
            </div>
            {autoDetectCommitments && (
              <>
                <label style={label()}>ערך "מקור התנועה" שמסמן חיוב אוטומטי (בילינג)</label>
                <input type="text" value={billingSourceValue} onChange={(e) => setBillingSourceValue(e.target.value)} style={input()} />
              </>
            )}
            <label style={label()}>ערכי "סטטוס תשלום" שנחשבים הצלחה (מופרדים בפסיק, ריק תמיד נחשב הצלחה)</label>
            <input type="text" value={successStatusValuesText} onChange={(e) => setSuccessStatusValuesText(e.target.value)} style={input()} placeholder="תקין" />
            {workspace?.name === 'תרומות' && (
              <div style={note()}>
                💡 יש לכם גם דוח מפורט (כל תרומה בשורה נפרדת) וגם דוח מסכם לאותה תקופה? ייבאו קודם את המפורט, ורק אחר כך את המסכם — כך נמנעת ספירה כפולה של אותה תרומה.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <button type="button" onClick={() => setStep('upload')} style={ghostBtn()}>חזרה</button>
              <button type="button" onClick={() => setStep('map')} disabled={!workspaceId} style={primaryBtn()}>המשך למיפוי עמודות</button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div>
            <p style={hint()}>שלב 3 מתוך 3: לכל עמודה שזוהתה בקובץ, בחרו לאיזה שדה במערכת היא שייכת. עמודה שלא נבחר לה שדה תתעלם ממנה. {dataRows.length} שורות נתונים זוהו.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" onClick={() => setAddingField((v) => !v)} style={ghostBtn()}>
                {addingField ? 'ביטול' : '+ שדה חדש'}
              </button>
            </div>
            {addingField && (
              <NewFieldPanel
                workspaceId={workspaceId}
                existingKeys={extraFields.map((f) => f.key)}
                onCreated={(field) => { setAddedFields((prev) => [...prev, field]); setAddingField(false); }}
              />
            )}
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
                    {workspace && (
                      <optgroup label="פרטי תנועה (להיסטוריה מלאה)">
                        {TXN_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </optgroup>
                    )}
                    {workspace && (
                      <optgroup label="פרטי התחייבות/הוראת קבע (לקיבוץ שורות)">
                        {COMMIT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </optgroup>
                    )}
                    {workspace && (
                      <optgroup label="שיוך לפעילות/סטטוס">
                        <option value="note">הערה ראשונית (לטאב פעילות)</option>
                        {stages.length > 0 && <option value="stage">שלב בפייפליין (סטטוס)</option>}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
            </div>

            {headers.some((h) => mapping[h] === 'stage') && stages.length > 0 && (
              <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>מיפוי ערכי סטטוס לשלב בפייפליין</div>
                {headers.filter((h) => mapping[h] === 'stage').map((h) => (
                  <div key={h} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>עמודה: {h}</div>
                    {distinctValuesForHeader(h).map((val) => (
                      <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 12.5 }} title={val}>{val}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>←</span>
                        <select
                          value={stageValueFor(h, val)}
                          onChange={(e) => setStageValue(h, val, e.target.value)}
                          style={{ ...input(), width: 180, marginBottom: 0 }}
                        >
                          {stages.map((s) => <option key={s.stage_key} value={s.stage_key}>{s.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

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
              {(result.transactionsAdded > 0 || result.transactionsSkipped > 0) && (
                <li>
                  {result.transactionsAdded} תנועות תרומה נוספו להיסטוריה
                  {result.transactionsSkipped > 0 && ` (${result.transactionsSkipped} דולגו — כבר קיימות מייבוא קודם)`}
                </li>
              )}
              {(result.commitmentsCreated > 0 || result.commitmentsUpdated > 0) && (
                <li>
                  {result.commitmentsCreated} הוראות קבע/התחייבויות חדשות נוצרו
                  {result.commitmentsUpdated > 0 && `, ${result.commitmentsUpdated} עודכנו`}
                </li>
              )}
              {futureSkipped > 0 && (
                <li>{futureSkipped} תנועות עם תאריך עתידי דולגו (טרם נגבו בפועל, לא נרשמו כתרומה)</li>
              )}
              {result.commitmentsAutoDetected > 0 && (
                <li>{result.commitmentsAutoDetected} הוראות קבע זוהו אוטומטית מתוך תנועות חוזרות</li>
              )}
              {(result.bouncedAttached > 0 || result.bouncedOrphanCommitmentsCreated > 0) && (
                <li>
                  {result.bouncedAttached} חיובים כושלים צורפו להתחייבות (לא נרשמו כתרומה - רק עדכנו מונה כשלונות)
                  {result.bouncedOrphanCommitmentsCreated > 0 && `, ${result.bouncedOrphanCommitmentsCreated} התחייבויות נוצרו מחיובים כושלים בלבד (ללא אף תשלום מוצלח)`}
                </li>
              )}
              {result.bouncedRowsSkippedNoCommitment > 0 && (
                <li>{result.bouncedRowsSkippedNoCommitment} חיובים כושלים בודדים דולגו (לא ניתן לשייך להתחייבות - לא נרשמו כתרומה)</li>
              )}
              {result.additionalPhonesCreated > 0 && (
                <li>{result.additionalPhonesCreated} מספרי טלפון נוספים נשמרו (מעבר לשני שדות הטלפון הרגילים - זמינים בלשונית "טלפונים נוספים" בכרטיס)</li>
              )}
            </ul>
            {result.multiValueFieldConflicts?.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.multiValueFieldConflicts.map((c) => (
                  <MultiValueFieldPrompt key={c.fieldKey} workspaceId={workspaceId} conflict={c} />
                ))}
              </div>
            )}
            {result.conflictsFound > 0 && (
              <div style={note()}>
                ⚠ {result.conflictsFound} ערכים בקובץ התנגשו עם נתון קיים ולא נדרסו - הם ממתינים לבדיקה שלכם (אפשר עכשיו או בכל זמן מאוחר יותר דרך "קונפליקטים בייבוא" בהגדרות).
                {' '}
                <a href="/dashboard/settings/import-conflicts" style={{ color: 'inherit', fontWeight: 600 }}>בדיקה עכשיו →</a>
              </div>
            )}
            <button type="button" onClick={resetAll} style={{ ...primaryBtn(), marginTop: 14 }}>סגירה</button>
          </div>
        )}
      </div>
    </div>
  );
}

// שאלה חד-פעמית לשדה (לא לכל שורה בנפרד) שמופיעה בסוף הייבוא כשנמצאו
// התנגשויות על שדה שמסומן "יכול להיות כמה ערכים" (migration 0058) -
// למשל "קורס קצר שנרכש", כשבאקסל אחד רשום קורס אחד ובאקסל אחר קורס
// שונה לאותו אדם. "כן" יוצר עמודה כפילה ומעביר אליה בדיוק את
// ההתנגשויות שנוצרו בייבוא הזה (conflict.conflictIds); "לא" משאיר
// אותן בתור הקונפליקטים הרגיל לבדיקה ידנית מאוחר יותר.
function MultiValueFieldPrompt({ workspaceId, conflict }) {
  const [status, setStatus] = useState('asking'); // asking | done | skipped
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const [newFieldLabel, setNewFieldLabel] = useState(null);

  function handleSplit() {
    setIsPending(true);
    setError(null);
    splitMultiValueField(workspaceId, conflict.fieldKey, conflict.conflictIds).then((res) => {
      setIsPending(false);
      if (res?.error) { setError(res.error); return; }
      setNewFieldLabel(res.newFieldLabel);
      setStatus('done');
    });
  }

  return (
    <div style={{ background: '#eef6f2', border: '1px solid #bfe0cf', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
      {status === 'asking' && (
        <>
          <div style={{ marginBottom: 8 }}>
            נמצאו {conflict.conflictIds.length} ערכים שונים בשדה "{conflict.label}" שכבר קיים אצל אנשי קשר בקובץ הזה - השדה מסומן כ"יכול להיות כמה ערכים". לפתוח עמודה נוספת ולהעביר אליה את הערכים החדשים, במקום שהם יישארו סתם קונפליקט?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleSplit} disabled={isPending} style={primaryBtn()}>
              {isPending ? 'פותח עמודה...' : 'כן, לפתוח עמודה נוספת'}
            </button>
            <button type="button" onClick={() => setStatus('skipped')} disabled={isPending} style={ghostBtn()}>
              לא, להשאיר בתור קונפליקטים
            </button>
          </div>
          {error && <div style={{ color: 'var(--red, #b23b2f)', marginTop: 6 }}>{error}</div>}
        </>
      )}
      {status === 'done' && <div>✓ נוצרה עמודה "{newFieldLabel}" - הערכים הועברו אליה.</div>}
      {status === 'skipped' && <div>הערכים נשארו בתור הקונפליקטים לבדיקה ידנית.</div>}
    </div>
  );
}

// יצירת שדה מחלקתי חדש בלי לצאת מהאשף - אותה פעולת שרת (createField)
// ואותם כללים בדיוק כמו מסך "שדות מחלקתיים"/"+ הוספת עמודה" בניהול
// נתונים מרכזי (ר' DataGridClient.js), רק טופס מקוצר: בלי סוג "מחושב",
// כי אי אפשר לייבא ערך לתוכו ממילא.
function NewFieldPanel({ workspaceId, existingKeys, onCreated }) {
  const [fieldKey, setFieldKey] = useState(() => generateFieldKey(existingKeys));
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [optionsText, setOptionsText] = useState('');
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);

  function handleCreate() {
    setError(null);
    setIsPending(true);
    const options = type === 'select' ? optionsText.split(',').map((s) => s.trim()).filter(Boolean) : [];
    createField(workspaceId, { fieldKey, label, type, options }).then((res) => {
      setIsPending(false);
      if (res?.error) { setError(res.error); return; }
      onCreated({ key: fieldKey, label, type, options });
    });
  }

  return (
    <div style={{ background: 'var(--bg-secondary, #f9f9f9)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input placeholder="מפתח טכני (אנגלית)" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} style={{ ...input(), width: 160, marginBottom: 0 }} />
        <input placeholder="תווית (למשל: מקור פנייה)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...input(), width: 180, marginBottom: 0 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...input(), width: 130, marginBottom: 0 }}>
          {NEW_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {type === 'select' && (
          <input placeholder="אפשרויות, מופרדות בפסיק" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} style={{ ...input(), width: 200, marginBottom: 0 }} />
        )}
        <button type="button" onClick={handleCreate} disabled={isPending || !fieldKey.trim() || !label.trim()} style={primaryBtn()}>
          {isPending ? 'יוצר...' : 'יצירה'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--red, #b23b2f)', fontSize: 12, marginTop: 6 }}>{error}</div>}
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

function note() {
  return {
    fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 6, padding: '8px 10px', marginTop: 10,
  };
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
