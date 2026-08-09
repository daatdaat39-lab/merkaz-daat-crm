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
import { findExistingMatch, insertDonationTransaction, upsertContactExternalId } from './leadIntakeCore';
import { isKesherConfigured, getKesherTransactions, getKesherObligations } from '../../../lib/kesher/client';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// מיפוי תת-מחרוזת משם ה-Project בקשר לשם מחלקה אצלנו - צריך אימות/כיוונון
// מול השמות האמיתיים בחשבון קשר בריצה הראשונה החיה (לא ידוע מראש מהתיעוד).
const PROJECT_TO_WORKSPACE = [
  { match: 'תרומות', workspaceName: 'תרומות' },
  { match: 'קורסים', workspaceName: 'דעת ותבונה' },
];

function resolveWorkspaceName(projectField) {
  const p = (projectField || '').toString();
  const found = PROJECT_TO_WORKSPACE.find((m) => p.includes(m.match));
  return found?.workspaceName || null;
}

function safeDate(raw) {
  const s = (raw || '').toString().trim();
  if (!s || s === '-----') return null;
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

export async function syncKesherReports(fromDate, toDate) {
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

  for (const t of transactions) {
    try {
      const rawProject = t.ProjectName || t.Project;
      const workspaceName = resolveWorkspaceName(rawProject);
      const workspace = workspaceName ? workspaceByName.get(workspaceName) : null;
      if (!workspace) {
        result.projectUnmatched++;
        if (rawProject && unmatchedProjectSamples.size < 10) unmatchedProjectSamples.add(rawProject.toString());
        continue;
      }

      const idnum = (t.Tz || '').toString().trim() || null;
      const phone = (t.Phone || '').toString().trim() || null;
      const email = (t.Mail || '').toString().trim() || null;
      const contact = await findExistingMatch(supabase, { idnum, phone, email });
      if (!contact) { result.transactionsUnmatched++; continue; }

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
        fundraiserName: t.User || null,
      });
      if (added === true) result.transactionsCreated++;
      else if (added === false) result.transactionsSkipped++;
      else result.transactionsUnmatched++;

      await upsertContactExternalId(supabase, contact.id, 'קשר', t.NumTransaction);
    } catch {
      result.transactionsUnmatched++;
    }
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
      const workspaceName = resolveWorkspaceName(o.Project);
      const workspace = workspaceName ? workspaceByName.get(workspaceName) : null;
      if (!workspace) {
        result.projectUnmatched++;
        if (o.Project && unmatchedProjectSamples.size < 10) unmatchedProjectSamples.add(o.Project.toString());
        if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'דולג - פרויקט לא זוהה', project: o.Project });
        continue;
      }

      const idnum = (o.ClientId || '').toString().trim() || null;
      const phone = (o.Phone || '').toString().trim() || null;
      const contact = await findExistingMatch(supabase, { idnum, phone });
      if (!contact) {
        logIssue(o, 'לא הותאם לאיש קשר');
        if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'דולג - לא הותאם לאיש קשר', idnum, phone });
        continue;
      }

      const reference = (o.Reference || '').toString().trim();
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

      const patch = {
        status: mapKesherStatus(o),
        bounced_count: Number(o.NotPassedPayments) || 0,
        start_date: safeDate(o.StartDate),
        end_date: safeDate(o.EndDate),
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
    } catch (err) {
      logIssue(o, 'שגיאה בעיבוד');
      if (isWatched) debugOutcomes.push({ reference: o.Reference, outcome: 'שגיאה בעיבוד (catch)', error: err?.message });
    }
  }

  result.unmatchedProjectSamples = Array.from(unmatchedProjectSamples);
  result.obligationsFetched = obligations.length;
  result.obligationIssues = obligationIssues;
  result.debugMatches = debugMatches;
  result.debugOutcomes = debugOutcomes;
  return result;
}
