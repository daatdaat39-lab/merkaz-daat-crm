'use server';

// סנכרון דוחות בלבד ממערכת "קשר" (ר' lib/kesher/client.js - הקובץ הזה
// לעולם לא קורא לשום פונקציה מחייבת של קשר, גם לא בעקיפין). שולף
// עסקאות (GetTrans) והתחייבויות (GetObligations), מתאים כל רשומה
// לאיש קשר קיים לפי ת"ז/טלפון/מייל (findExistingMatch הקיימת), ומשייך
// לפי שדה Project בתשובת קשר למחלקה הנכונה אצלנו. לעולם לא יוצר איש
// קשר חדש בשקט - רשומה בלי התאמה נספרת ומוחזרת לבדיקה ידנית.
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../lib/contactGuards';
import { findExistingMatch, insertDonationTransaction, upsertContactExternalId, upsertDepartmentMembership } from './leadIntakeCore';
import { isKesherConfigured, getKesherTransactions, getKesherObligations } from '../../../lib/kesher/client';
import { enrollInKesherCampaign, enrollInCampaign } from '../sales/campaigns/kesherCampaign';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// מיפוי תת-מחרוזת משם ה-Project בקשר לשם מחלקה אצלנו - אומת מריצה חיה.
const PROJECT_TO_WORKSPACE = [
  { match: 'תרומות', workspaceName: 'תרומות' },
  { match: 'קורסים', workspaceName: 'דעת ותבונה' },
  { match: 'tvunah', workspaceName: 'דעת ותבונה' }, // חנות WooCommerce "www.tvunah.com" - אושר מריצה מלאה (2010-2026)
  { match: 'daat.org.il', workspaceName: 'תרומות' }, // חנות WooCommerce "daat.org.il" - תת-העמוד היחיד שנצפה הוא "תרומה - דעת לימודי יהדות"
  // "00005 - רישום לקעמפ" נבדק ואושר במפורש להישאר בלי ניתוב בשלב הזה -
  // לא לגעת בלי החלטה מפורשת נוספת.
];

// עמוד "ישיבה" בקשר מכיל בתוכו כמה תת-תוכניות שכל אחת אמורה להיכנס
// למחלקה שונה אצלנו - שדה ה-Project עצמו תמיד רק "ישיבה" (אין תת-פירוט
// שם), ההבחנה היחידה שנמצאה בפועל (מריצה חיה) היא PaymentPageName על
// התנועה עצמה (GetTrans) - "דמי רישום לישיבה - התשפ"ז" וכו'.
// GetObligations לא מכיל את השדה הזה בכלל - ר' refToPaymentPage למטה,
// שבונה מיפוי אסמכתא->PaymentPageName מהתנועות כדי שגם התחייבויות
// (שאין להן PaymentPageName ישיר) יידעו להיכנס למחלקה הנכונה.
const YESHIVA_PAGE_TO_ROUTING = [
  // מנותב למחלקת "ישיבת דעת" (נפתחה לאחר ניתוב זה במקור) בשלב 'הורה'
  // (parent_of_student) - מייצג הורה ששילם שכר לימוד/רישום, לא תלמיד.
  { match: 'רישום', workspaceName: 'ישיבת דעת', tag: 'הורי תלמידים', stage: 'parent_of_student' },
  { match: 'שכר לימוד', workspaceName: 'ישיבת דעת', tag: 'הורי תלמידים', stage: 'parent_of_student' },
  { match: 'קורס', workspaceName: 'דעת ותבונה' },
];

const TZRIDEI_CAMPAIGN_NAME = 'קמפיין צרידי אלול פ"ו';

// מחזיר { workspaceName, tag?, enrollCampaignName? } או null אם לא זוהה
// שום ניתוב. pageName רלוונטי רק לפרויקט "ישיבה" - PaymentPageName ישיר
// (מתנועה) או דרך refToPaymentPage (עבור התחייבות, לפי אסמכתא).
function resolveRouting(projectField, pageName) {
  const p = (projectField || '').toString();
  const direct = PROJECT_TO_WORKSPACE.find((m) => p.includes(m.match));
  if (direct) return { workspaceName: direct.workspaceName };

  if (p.includes('ישיבה')) {
    const page = (pageName || '').toString();
    const found = YESHIVA_PAGE_TO_ROUTING.find((m) => page.includes(m.match));
    return found ? { workspaceName: found.workspaceName, tag: found.tag || null, stage: found.stage || null } : null;
  }

  // "קמפיין צרידי ידידי דעת" - נכנס למחלקת תרומות כרגיל (תרומה/התחייבות
  // נרשמת שם), ובנוסף נרשם לקמפיין ייעודי "קמפיין צרידי אלול פ"ו".
  if (p.includes('צריד')) return { workspaceName: 'תרומות', enrollCampaignName: TZRIDEI_CAMPAIGN_NAME };

  return null;
}

// מוסיף תגית לאיש קשר (בלי לדרוס תגיות קיימות, בלי כפילות) - למשל
// "הורי תלמידים" לתורמים שזוהו דרך עמוד "דמי רישום"/"שכר לימוד" בישיבה.
async function addTagToContact(supabase, contactId, tag) {
  const { data: c } = await supabase.from('contacts').select('tags').eq('id', contactId).maybeSingle();
  if (!c) return;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  if (tags.includes(tag)) return;
  await supabase.from('contacts').update({ tags: [...tags, tag] }).eq('id', contactId);
}

// קשר מחזירה תאריכים כ-DD/MM/YYYY (לדוגמה "26/05/2026") - אם מעבירים
// את זה כמו שהוא ל-Postgres, הוא מפרש כ-MM/DD/YYYY ונופל בכל תאריך
// שהיום בו גדול מ-12 (למשל "26/05" -> חודש 26, לא תקין). אושר ישירות
// מריצה חיה - שגיאת DB "date/time field value out of range" בדיוק
// על הרשומות עם יום>12 (26, 28, 30), בעוד רשומות עם יום<=12 (11, 02)
// עברו "במקרה". ממירים תמיד ל-YYYY-MM-DD.
function safeDate(raw) {
  const s = (raw || '').toString().trim();
  if (!s || s === '-----') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, day, month, year] = m;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return s;
}

// מיפוי סטטוס - מאומת מריצה חיה אמיתית (לא ניחוש): StatusId="1" הוא
// "פעיל", StatusId="2" הוא "נכשל" (יש CancelDate), StatusId="3" הוא
// "הסתיים" (בלי CancelDate - הגיע לסוף התקופה). "בוטל" כמילה מילולית
// לא הופיע בכלל בערכים האמיתיים - הניחוש הקודם (חיפוש "בוטל" בטקסט)
// לכן לא תפס שום דבר.
function mapKesherStatus(o) {
  if (o.StatusId === '1') return 'active';
  if (o.StatusId === '2') return 'cancelled';
  if (o.StatusId === '3') return 'fulfilled';
  // גיבוי אם StatusId חסר: CancelDate כסימן ביטול, אחרת פעיל.
  return o.CancelDate ? 'cancelled' : 'active';
}

// ממלא אוטומטית את השדה הנוסף card_last4/bank_account_ref (אם קיים
// ומוגדר למחלקה) מתוך 4 הספרות האחרונות שקשר מחזירה - רק אם השדה
// עדיין ריק (לעולם לא דורס ערך שהוזן ידנית). לא יוצר שיוך מחלקה חדש
// רק בשביל השדה - אם אין עדיין contact_departments לא עושה כלום.
async function autoFillPaymentRef(supabase, contact, workspace, o) {
  const last4 = (o.AccountOrNumCard || '').toString().trim();
  if (!last4) return;
  const isCredit = (o.ChargeOptionType || '').toString().includes('אשראי');
  const key = isCredit ? 'card_last4' : 'bank_account_ref';

  const { data: deptRow } = await supabase
    .from('contact_departments')
    .select('id, extra_fields')
    .eq('contact_id', contact.id)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (!deptRow) return;

  const existingValue = (deptRow.extra_fields || {})[key];
  if (existingValue) return;

  const { data: fieldDef } = await supabase.from('workspace_extra_fields')
    .select('type').eq('workspace_id', workspace.id).eq('field_key', key).maybeSingle();
  if (!fieldDef || fieldDef.type === 'computed') return;

  const extra_fields = { ...(deptRow.extra_fields || {}), [key]: last4 };
  await supabase.from('contact_departments').update({ extra_fields }).eq('id', deptRow.id);
}

// יוצר איש קשר חדש עבור רשומת קשר (עסקה/התחייבות) שלא הותאמה לאף איש
// קשר קיים - קורה רק אם יש שם שמיש (Name); בלי שם, לא ניתן ליצור כרטיס
// תקין (contacts.first חובה), אז מחזירים null וממשיכים לנתיב "לא הותאם"
// הקיים. איש קשר חדש נוצר עם opened_process=false (לא נכנס ללוח
// הלידים) ונרשם לקמפיין "נכנס ממערכת קשר" של המחלקה - כך שהצוות יכול
// לעקוב אחריו בלי להציף את לוח הלידים הרגיל בכל תרומה חד-פעמית שקשר
// מזהה. הערה: לא מאומת מריצה חיה אם קשר בפועל מחזירה שדה Name בתשובת
// GetTrans/GetObligations - אם לא, הפונקציה פשוט לא יוצרת כלום (בלי
// שגיאה) וההתנהגות נשארת זהה למה שהיה לפני השינוי הזה.
async function createContactFromKesher(supabase, { name, idnum, phone, email }, workspace, userId, stage = null) {
  const trimmedName = (name || '').toString().trim();
  if (!trimmedName) return null;
  // בלי אף פרט מזהה (לא ת.ז, לא טלפון, לא מייל) - אין שום דרך לזהות
  // בריצה הבאה שכבר יצרנו כרטיס לאותו אדם, ואז כל ריצת סנכרון הייתה
  // יוצרת עוד כרטיס ריק כפול (אושר מריצה חיה - 6 כרטיסים ריקים ל"שמש
  // ענת" בלבד, ועוד זוג ל"רם לורן", מריצות היום). עדיף לא ליצור כלל -
  // ממשיכים לנתיב "לא הותאם" הקיים, בדיוק כמו כשאין שם בכלל.
  if (!idnum && !phone && !email) return null;
  const [first, ...rest] = trimmedName.split(/\s+/);
  const last = rest.join(' ');

  const { data: created } = await supabase.from('contacts').insert({
    first, last, phone: phone || null, idnum: idnum || null, email: email || null, source: 'קשר',
  }).select('id, tags, phone, phone2, email, email2, idnum, birth_date, gender').single();
  if (!created) return null;

  const reason = workspace.name === 'תרומות' ? 'תרומה/התחייבות מקשר' : 'תשלום/התחייבות מקשר';
  await upsertDepartmentMembership(supabase, created.id, workspace, reason, null, 'קשר', null, { openProcess: false, requiresApproval: false, stage });
  await enrollInKesherCampaign(supabase, workspace.id, created.id, userId);
  return created;
}

export async function syncKesherReports(fromDate, toDate, createNewContacts = true) {
  const { supabase, user } = await requireUser();
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק בעלים/מנהל יכול להריץ סנכרון מקשר' };
  if (!isKesherConfigured()) return { error: 'קשר לא מוגדר - חסרים משתני סביבה בשרת (KESHER_USERNAME/KESHER_PASSWORD)' };
  if (!fromDate || !toDate) return { error: 'יש לבחור טווח תאריכים' };

  const { data: workspaces } = await supabase.from('workspaces').select('id, name');
  const workspaceByName = new Map((workspaces || []).map((w) => [w.name, w]));

  const result = {
    success: true,
    transactionsCreated: 0, transactionsSkipped: 0, transactionsUnmatched: 0,
    obligationsCreated: 0, obligationsUpdated: 0, obligationsUnmatched: 0,
    projectUnmatched: 0,
  };
  // ערכי Project גולמיים שלא זוהו - לאבחון מהיר של PROJECT_TO_WORKSPACE
  // בלי גישה ישירה לתשובת קשר (מוצג בתוצאה, לא רק בלוג שרת).
  const unmatchedProjectSamples = new Set();
  // אבחון להתחייבויות שלא נכתבו - שדות גולמיים לכל רשומה, כדי לדעת
  // בדיוק למה (חוסר התאמת איש קשר, סכום לא תקין וכו') בלי גישה ישירה
  // לתשובת קשר.
  const obligationIssues = [];
  // אבחון ממוקד זמני (לחקירה הנוכחית בלבד - להסיר אחרי שנסגור אותה):
  // מציג את כל הרשומות הגולמיות שקשר מחזירה עבור איש קשר ספציפי,
  // עוד לפני כל סינון/פענוח - כדי לדעת בוודאות אם רשומה "חסרה" בכלל
  // לא הגיעה מקשר, או שהיא הגיעה ונפלה בהתאמה/סינון אצלנו.
  const DEBUG_WATCH_CLIENT_IDS = ['205906571'];
  const DEBUG_WATCH_PHONES = ['0548053770'];
  const debugMatches = [];
  const debugOutcomes = [];
  const debugTransactionMatches = [];

  let transactions = [];
  let obligations = [];
  try {
    transactions = await getKesherTransactions({ fromDate, toDate });
  } catch (err) {
    return { error: err.message };
  }
  try {
    obligations = await getKesherObligations({ fromDate, toDate });
  } catch (err) {
    return { error: err.message };
  }

  // GetObligations לא מכיל PaymentPageName - בונים מיפוי אסמכתא (Reference
  // == ObligationReference בתנועה) -> PaymentPageName מהתנועות שכבר
  // נשלפו, כדי שגם התחייבויות תחת "ישיבה" יידעו לאיזו תת-תוכנית לנתב.
  const refToPaymentPage = new Map();
  for (const t of transactions) {
    const ref = (t.ObligationReference || '').toString().trim();
    const page = (t.PaymentPageName || '').toString().trim();
    if (ref && page && !refToPaymentPage.has(ref)) refToPaymentPage.set(ref, page);
  }

  function logIssue(o, reason) {
    result.obligationsUnmatched++;
    if (obligationIssues.length < 15) {
      obligationIssues.push({
        reference: o.Reference || null,
        clientId: o.ClientId || null,
        phone: o.Phone || null,
        status: o.Status || null,
        statusId: o.StatusId || null,
        cancelDate: o.CancelDate || null,
        reason,
      });
    }
  }

  for (const o of obligations) {
    const isWatched = DEBUG_WATCH_CLIENT_IDS.includes((o.ClientId || '').toString().trim()) || DEBUG_WATCH_PHONES.includes((o.Phone || '').toString().trim());
    if (isWatched) debugMatches.push(o);
    try {
      const referenceForRouting = (o.Reference || '').toString().trim();
      const routing = resolveRouting(o.Project, refToPaymentPage.get(referenceForRouting));
      const workspace = routing ? workspaceByName.get(routing.workspaceName) : null;
      if (!workspace) {
        result.projectUnmatched++;
        if (o.Project && unmatchedProjectSamples.size < 10) unmatchedProjectSamples.add(o.Project.toString());
        if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'דולג - פרויקט לא זוהה', project: o.Project });
        continue;
      }

      const idnum = (o.ClientId || '').toString().trim() || null;
      const phone = (o.Phone || '').toString().trim() || null;
      let contact = await findExistingMatch(supabase, { idnum, phone });
      // איש קשר שהותאם (לא נוצר כרגע) - צריך לוודא שיש לו שיוך למחלקה הזו,
      // גם אם זו הפעם הראשונה שהוא נוגע בה. בלי זה: ההתחייבות נרשמת עם
      // workspace_id תקין, אבל בלי contact_departments - "נעלמת" מכל מסך
      // מחלקתי למרות שיש לו כסף אמיתי (נמצא בפועל - 68 מקרים בסריקה).
      if (contact) {
        const reason = workspace.name === 'תרומות' ? 'תרומה/התחייבות מקשר' : 'תשלום/התחייבות מקשר';
        await upsertDepartmentMembership(supabase, contact.id, workspace, reason, null, 'קשר', null, { openProcess: false, requiresApproval: false, stage: routing.stage || null });
      } else if (createNewContacts) {
        contact = await createContactFromKesher(supabase, { name: o.Name, idnum, phone }, workspace, user.id, routing.stage || null);
      }
      if (!contact) {
        logIssue(o, 'לא הותאם לאיש קשר');
        if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'דולג - לא הותאם לאיש קשר', idnum, phone });
        continue;
      }

      if (routing.tag) await addTagToContact(supabase, contact.id, routing.tag);
      if (routing.enrollCampaignName) await enrollInCampaign(supabase, workspace.id, contact.id, user.id, routing.enrollCampaignName);

      const reference = referenceForRouting;
      if (!reference) {
        logIssue(o, 'אין אסמכתא (Reference)');
        if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'דולג - אין אסמכתא' });
        continue;
      }

      const totalAmount = Number(o.Sum) > 0 ? Number(o.Sum) * (Number(o.NumPayments) > 0 ? Number(o.NumPayments) : 1) : Number(o.FinalSum);
      if (!totalAmount || totalAmount <= 0) {
        logIssue(o, 'סכום לא תקין');
        if (isWatched) debugOutcomes.push({ reference, outcome: 'דולג - סכום לא תקין', sum: o.Sum, numPayments: o.NumPayments, finalSum: o.FinalSum, computed: totalAmount });
        continue;
      }

      const { data: existing } = await supabase
        .from('commitments')
        .select('id')
        .eq('workspace_id', workspace.id)
        .eq('external_reference', reference)
        .maybeSingle();

      // NumPayments לא מספרי (למשל "לא הגבלה") מסמן הוראת קבע מתמשכת -
      // אושר מריצה חיה: יחד עם שדה Day (יום בחודש) ותשלומים שעברו בפועל
      // בהפרש חודש בדיוק (28/5, 28/6, 28/7) - זו הוראת קבע חודשית.
      // NumPayments מספרי אמיתי מסמן התחייבות חד-פעמית/קבועת-כמות.
      const isRecurring = o.NumPayments != null && Number.isNaN(Number(o.NumPayments));
      const patch = {
        status: mapKesherStatus(o),
        bounced_count: Number(o.NotPassedPayments) || 0,
        start_date: safeDate(o.StartDate),
        end_date: safeDate(o.EndDate),
        frequency: isRecurring ? 'חודשי' : null,
        // עדיפות ל-PaymentPageName (שם הדף הספציפי, למשל "קורס 'מבעד
        // לפחד'") על פני ObligationFor (סיבה גנרית כמו "תרומה") - הרבה
        // יותר אינפורמטיבי לדעת מה בדיוק האדם רכש, לא רק שהוא "תרם".
        designation: (refToPaymentPage.get(referenceForRouting) || o.ObligationFor || '').toString().trim() || null,
        payment_method: (o.ChargeOptionType || '').toString().trim() || null,
        last_payment_status: (o.StatusLastTran || '').toString().trim() || null,
        source_channel: (o.OpenBy || '').toString().trim() || null,
        note: (o.Comment || '').toString().trim() || null,
        source_system: 'קשר',
      };

      if (existing) {
        await supabase.from('commitments').update(patch).eq('id', existing.id);
        result.obligationsUpdated++;
        if (isWatched) debugOutcomes.push({ reference, outcome: 'עודכן', existingId: existing.id, patch });
      } else {
        const { error: insertError } = await supabase.from('commitments').insert({
          contact_id: contact.id, workspace_id: workspace.id,
          total_amount: totalAmount, installments_count: Number(o.NumPayments) || 1,
          external_reference: reference, created_by: user.id,
          ...patch,
        });
        if (insertError) {
          if (isWatched) debugOutcomes.push({ reference, outcome: 'שגיאת הכנסה ל-DB', error: insertError.message, totalAmount, workspaceId: workspace.id });
        } else {
          result.obligationsCreated++;
          if (isWatched) debugOutcomes.push({ reference, outcome: 'נוצר', totalAmount, workspaceId: workspace.id });
        }
      }

      await autoFillPaymentRef(supabase, contact, workspace, o);
    } catch (err) {
      logIssue(o, 'שגיאה בעיבוד');
      if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'שגיאה בעיבוד (catch)', error: err?.message });
    }
  }

  // הלולאה רצה אחרי ההתחייבויות (לא לפני) כדי שאפשר יהיה לקשר כל תנועה
  // להתחייבות שלה (ObligationReference) גם באותה ריצת סנכרון - כולל
  // התחייבות שרק נוצרה כרגע בלולאה למעלה, לא רק בהתחייבות ישנה מריצה קודמת.
  for (const t of transactions) {
    if (DEBUG_WATCH_CLIENT_IDS.includes((t.Tz || '').toString().trim()) || DEBUG_WATCH_PHONES.includes((t.Phone || '').toString().trim())) {
      debugTransactionMatches.push(t);
    }
    try {
      const rawProject = t.ProjectName || t.Project;
      const routing = resolveRouting(rawProject, t.PaymentPageName);
      const workspace = routing ? workspaceByName.get(routing.workspaceName) : null;
      if (!workspace) {
        result.projectUnmatched++;
        if (rawProject && unmatchedProjectSamples.size < 10) unmatchedProjectSamples.add(rawProject.toString());
        continue;
      }

      const idnum = (t.Tz || '').toString().trim() || null;
      const phone = (t.Phone || '').toString().trim() || null;
      const email = (t.Mail || '').toString().trim() || null;
      let contact = await findExistingMatch(supabase, { idnum, phone, email });
      // ר' הערה מקבילה בלולאת ההתחייבויות למעלה - איש קשר שהותאם צריך
      // שיוך-מחלקה מפורש גם אם זו הפעם הראשונה שהוא נוגע במחלקה הזו.
      if (contact) {
        const reason = workspace.name === 'תרומות' ? 'תרומה/התחייבות מקשר' : 'תשלום/התחייבות מקשר';
        await upsertDepartmentMembership(supabase, contact.id, workspace, reason, null, 'קשר', null, { openProcess: false, requiresApproval: false, stage: routing.stage || null });
      } else if (createNewContacts) {
        contact = await createContactFromKesher(supabase, { name: t.Name, idnum, phone, email }, workspace, user.id, routing.stage || null);
      }
      if (!contact) { result.transactionsUnmatched++; continue; }

      if (routing.tag) await addTagToContact(supabase, contact.id, routing.tag);
      if (routing.enrollCampaignName) await enrollInCampaign(supabase, workspace.id, contact.id, user.id, routing.enrollCampaignName);

      // ObligationReference מקשרת כל תנועה בודדת להתחייבות/הוראת הקבע
      // שממנה היא נגבתה - אושר מריצה חיה (השדה קיים בכל תנועה, מצביע
      // על Reference אמיתי בהתחייבויות). ממלא commitment_id הקיים - אבל
      // רק אם ההתחייבות שנמצאה שייכת לאותו איש קשר שהתנועה עצמה הותאמה
      // אליו! אומת מריצה חיה: כשההתאמה של ההתחייבות (לפי ClientId+Phone
      // בלבד) ושל התנועה (לפי Tz+Phone+Mail) לא מסתדרות בדיוק על אותו
      // איש קשר (למשל בגלל פרטים לא-עקביים בקשר עצמה), אותה אסמכתא
      // חיצונית עלולה "להצביע" בטעות על התחייבות של אדם אחר לגמרי -
      // בלי הבדיקה הזו, commitment_id היה מקשר תרומה של תורם אחד להתחייבות
      // של תורם אחר.
      let commitmentId = null;
      const obligationRef = (t.ObligationReference || '').toString().trim();
      if (obligationRef) {
        const { data: linkedCommitment } = await supabase
          .from('commitments')
          .select('id, contact_id')
          .eq('workspace_id', workspace.id)
          .eq('external_reference', obligationRef)
          .maybeSingle();
        if (linkedCommitment && linkedCommitment.contact_id === contact.id) {
          commitmentId = linkedCommitment.id;
        }
      }

      // GetTrans מחזירה Total באגורות (בשונה מ-GetObligations, ששם Sum
      // כבר בשקלים) - אושר ישירות מול נתונים אמיתיים: ₪500.00 בקשר
      // הוגיע כ-Total=50000. לא היה ברור מהתיעוד, רק מריצה חיה.
      const added = await insertDonationTransaction(supabase, contact.id, workspace.id, 'קשר', {
        amount: Number(t.Total) / 100,
        date: safeDate(t.TranDate),
        docNumber: t.NumTransaction,
        paymentMethod: t.TransactionCreditType || t.CreditType || null,
        transactionType: t.TransactionType || null,
        campaignReference: t.ProjectName || null,
        // שם הדף הספציפי (למשל שם הקורס) - כדי שהתנועה עצמה תגיד מה
        // בדיוק נרכש, לא רק לאיזו מחלקה זה נותב.
        designation: t.PaymentPageName || null,
        fundraiserName: t.User || null,
        commitmentId,
        // אושר מריצה חיה: אין t.PdfLink ברמה העליונה (כפי שנוחש קודם) -
        // הקישור נמצא ב-t.OriginalDoc (מקביל בדיוק לערך שבתוך
        // t.DocumentsDetails.DocumentDetails[0].PdfLink, שנשאר כגיבוי
        // למקרה שחסר OriginalDoc בתשובה עתידית).
        receiptUrl: t.OriginalDoc || t.DocumentsDetails?.DocumentDetails?.[0]?.PdfLink || null,
      });
      if (added === true) result.transactionsCreated++;
      else if (added === false) {
        result.transactionsSkipped++;
        // insertDonationTransaction מדלגת בשקט על תנועה שכבר קיימת (לא
        // דורסת - עיקרון קבוע בכל הקוד הזה). אבל תנועות קשר שנכתבו לפני
        // שהתחלנו לשמור PaymentPageName (ר' למעלה) נשארו עם designation
        // ריק - כאן בלבד (לא בזרימת הייבוא הכללית) ממלאים את זה בדיעבד,
        // ורק אם עדיין ריק (is('designation', null)) - לעולם לא דורסים
        // ערך אמיתי שכבר קיים.
        const docNumber = (t.NumTransaction || '').toString().trim();
        if (t.PaymentPageName && docNumber) {
          await supabase.from('donation_transactions')
            .update({ designation: t.PaymentPageName })
            .eq('contact_id', contact.id)
            .eq('source_system', 'קשר')
            .eq('external_doc_number', docNumber)
            .is('designation', null);
        }
      }
      else result.transactionsUnmatched++;

      await upsertContactExternalId(supabase, contact.id, 'קשר', t.NumTransaction);
    } catch {
      result.transactionsUnmatched++;
    }
  }

  result.unmatchedProjectSamples = Array.from(unmatchedProjectSamples);
  result.obligationsFetched = obligations.length;
  result.obligationIssues = obligationIssues;
  result.debugMatches = debugMatches;
  result.debugOutcomes = debugOutcomes;
  result.debugTransactionMatches = debugTransactionMatches;
  return result;
}
