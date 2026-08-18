// זיהוי אוטומטי של הוראות קבע מתוך תנועות "שטוחות" (בלי עמודת אסמכתא
// הוראת-קבע בקובץ המקור, כמו "מערכת עסקים") - אלגוריתם שנבדק ואומת מול
// קובץ אמיתי (20,521 שורות) לפני שנכתב כאן: קיבוץ לפי (מספר חשבון +
// סכום) יחד - לא חשבון לבד, שגורם לאיחוד שגוי של כמה הוראות-קבע מקבילות
// של אותו אדם בסכומים שונים (נמצא בפועל: תורם עם 3 הוראות קבע נפרדות
// שהתאחדו לעשרות רשומות שגויות לפני התיקון). פונקציה טהורה, בלי גישה
// ל-DB, כדי שהמתמטיקה תהיה ניתנת לבדיקה בבידוד - נקראת רק מ-
// bulkImportContactRows (leadIntakeCore.js), לפני הלולאה הראשית שכותבת
// ל-DB שורה-שורה.
const RUN_GAP_DAYS = 100; // פער גדול מזה בין תשלומים עוקבים באותו (חשבון+סכום) = הוראת קבע נפרדת, לא המשך
const CYCLE_GAP_DAYS = 10; // פער קטן מזה = ניסיון-חוזר (נכשל ואז הצליח), לא תשלום נוסף
const DEFAULT_SUCCESS_VALUES = ['', 'תקין'];

// אותה היוריסטיקת DD/MM/YYYY בדיוק כמו parseRowDate ב-DepartmentImportWizard.js
// - מוכפלת כאן (לא מיובאת) כי זה קובץ 'use client' מול קוד שרת. נדרש כאן
// כדי לחשב פערי-ימים אמיתיים (100/10), לא רק להשוות מחרוזות.
function parseHistoricalDate(raw) {
  const s = (raw || '').toString().trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// מוטציה על rows במקום (מוסיף row.commitment לשורות שזוהו כחלק מהוראת
// קבע, מוחק row.donationTransaction משורות כושלות שלא יירשמו כתרומה) -
// לא בונה מערך חדש, כי rows[] מועבר לפי הפניה והלולאה הקיימת ב-
// bulkImportContactRows ממשיכה לרוץ על אותו rows אחרי הקריאה הזו.
//
// שני כללים נפרדים ומכוונים (לא תלויים זה בזה):
// 1. "לא לרשום תשלום כושל כתרומה" - פעיל תמיד כש-successStatusValues
//    סופק (כלומר עמודת txn:payment_status ממופה בכלל), בלי תלות אם
//    billingSourceValue סופק - כדי שלא יהיה מצב שהמשתמש ממפה סטטוס אבל
//    שוכח לסמן "זהה הוראות קבע" ותשלום כושל בכל זאת נכנס כתרומה אמיתית.
// 2. "קיבוץ שורות בילינג לרשומת הוראת-קבע אחת" - דורש billingSourceValue
//    מפורש.
//
// מחזיר { clustersFound, skippedNoCommitment } לתצוגה בסיכום הייבוא.
export function detectCommitments(rows, { successStatusValues, billingSourceValue } = {}) {
  if (!successStatusValues && !billingSourceValue) return { clustersFound: 0, skippedNoCommitment: 0 };
  const successSet = new Set((successStatusValues?.length ? successStatusValues : DEFAULT_SUCCESS_VALUES).map((s) => s.trim()));
  let clustersFound = 0;
  let skippedNoCommitment = 0;
  const groups = new Map(); // `${account}::${amount}` -> [{ row, date, amount, status, isFailure }]

  for (const row of rows) {
    const txn = row.donationTransaction;
    if (!txn) continue;
    if (row.commitment?.externalReference) continue; // מיפוי ידני מפורש (commit:ref) תמיד גובר - לא נוגעים

    const status = (txn.paymentStatus || '').toString().trim();
    const isFailure = status !== '' && !successSet.has(status);
    const isBillingEngine = !!billingSourceValue && (txn.source || '').toString().trim() === billingSourceValue;

    if (isFailure && !isBillingEngine) {
      // תשלום כושל שלא שייך למקור-בילינג (למשל ניסיון ידני שנכשל) - אין
      // הוראת קבע לתלות בו את הכישלון, ואסור לרשום אותו כתרומה.
      delete row.donationTransaction;
      skippedNoCommitment++;
      continue;
    }
    if (!billingSourceValue || !isBillingEngine) continue; // תנועה תקינה רגילה/לא-בילינג - נשארת תרומה עצמאית כרגיל

    const account = (row.externalId || '').toString().trim();
    const amount = Number(txn.amount) || 0;
    const date = parseHistoricalDate(txn.date);
    if (!account || !amount || !date) {
      if (isFailure) { delete row.donationTransaction; skippedNoCommitment++; }
      continue;
    }
    const key = `${account}::${amount}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, date, amount, status, isFailure });
  }

  function processRun(run) {
    if (!run.length) return;
    let cycles = 1;
    for (let i = 1; i < run.length; i++) {
      if ((run[i].date - run[i - 1].date) / 86400000 > CYCLE_GAP_DAYS) cycles++;
    }
    const hasAnySuccess = run.some((e) => !e.isFailure);
    const bouncedCount = run.filter((e) => e.isFailure).length;
    const amount = run[0].amount;
    const account = run[0].row.externalId.toString().trim();
    const firstDateRaw = run[0].row.donationTransaction.date;
    const lastDateRaw = run[run.length - 1].row.donationTransaction.date;
    // אסמכתא סינתטית יציבה: כוללת תאריך התחלת הריצה (לא משתנה בייבוא
    // חוזר גם אם נוספות שורות בהמשך) - כדי שריצה חוזרת על אותו קובץ (או
    // קובץ מעודכן עם עוד חודשים) תעדכן את אותה הוראת קבע, לא תשכפל.
    const externalReference = `עסקים:${account}:${amount}:${firstDateRaw}`;
    clustersFound++;

    // ריצה נחשבת "לא פעילה עוד" (status='cancelled' דרך resolveCommitment,
    // לא 'active') אם התשלום האחרון הידוע בה נכשל, או שעברו יותר מ-
    // RUN_GAP_DAYS יום מהתשלום האחרון עד "עכשיו" (זמן הייבוא) - כלומר
    // לאורך כל שאר הקובץ (שמכיל היסטוריה מלאה, לא רק חלון זמן חלקי) לא
    // נמצא שום המשך. בלי הבדיקה הזו כל הוראת-קבע מזוהה מסומנת 'active'
    // ללא תנאי (resolveCommitment's ברירת המחדל) - אושר מריצה חיה: 781
    // הוראות קבע ממערכת עסקים סומנו כך בטעות, 689 מהן עם תאריך סיום
    // שכבר עבר (חלקן עד 2015), 154 עם תשלום אחרון כושל.
    const lastEntry = run[run.length - 1];
    const daysSinceLastPayment = (Date.now() - lastEntry.date.getTime()) / 86400000;
    const isStale = lastEntry.isFailure || daysSinceLastPayment > RUN_GAP_DAYS;

    for (const entry of run) {
      const { row } = entry;
      const commitment = {
        externalReference,
        totalAmount: amount * cycles,
        installmentsCount: cycles,
        startDate: firstDateRaw,
        endDate: lastDateRaw,
        bouncedCount,
        designation: row.donationTransaction?.designation,
        paymentMethod: row.donationTransaction?.paymentMethod,
        cancelled: isStale,
      };
      if (entry.isFailure) {
        commitment.lastPaymentStatus = entry.status;
        if (!hasAnySuccess) commitment.__isOrphanRun = true;
        commitment.__isBounceRow = true;
        delete row.donationTransaction; // מוחקים אחרי שכבר קראנו designation/paymentMethod ממנו למעלה
      } else if (isStale) {
        commitment.lastPaymentStatus = 'לא זוהה תשלום נוסף לאורך יתרת הקובץ - כנראה לא נגבה יותר';
      }
      row.commitment = commitment;
    }
  }

  for (const entries of groups.values()) {
    entries.sort((a, b) => a.date - b.date);
    let runStart = 0;
    for (let i = 1; i <= entries.length; i++) {
      const gap = i < entries.length ? (entries[i].date - entries[i - 1].date) / 86400000 : Infinity;
      if (gap > RUN_GAP_DAYS || i === entries.length) {
        processRun(entries.slice(runStart, i));
        runStart = i;
      }
    }
  }

  return { clustersFound, skippedNoCommitment };
}
