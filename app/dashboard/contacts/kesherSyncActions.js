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
      const workspaceName = resolveWorkspaceName(t.ProjectName || t.Project);
      const workspace = workspaceName ? workspaceByName.get(workspaceName) : null;
      if (!workspace) { result.projectUnmatched++; continue; }

      const idnum = (t.Tz || '').toString().trim() || null;
      const phone = (t.Phone || '').toString().trim() || null;
      const email = (t.Mail || '').toString().trim() || null;
      const contact = await findExistingMatch(supabase, { idnum, phone, email });
      if (!contact) { result.transactionsUnmatched++; continue; }

      const added = await insertDonationTransaction(supabase, contact.id, workspace.id, 'קשר', {
        amount: t.Total,
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

  for (const o of obligations) {
    try {
      const workspaceName = resolveWorkspaceName(o.Project);
      const workspace = workspaceName ? workspaceByName.get(workspaceName) : null;
      if (!workspace) { result.projectUnmatched++; continue; }

      const idnum = (o.ClientId || '').toString().trim() || null;
      const phone = (o.Phone || '').toString().trim() || null;
      const contact = await findExistingMatch(supabase, { idnum, phone });
      if (!contact) { result.obligationsUnmatched++; continue; }

      const reference = (o.Reference || '').toString().trim();
      if (!reference) { result.obligationsUnmatched++; continue; }

      const totalAmount = Number(o.Sum) > 0 ? Number(o.Sum) * (Number(o.NumPayments) > 0 ? Number(o.NumPayments) : 1) : Number(o.FinalSum);
      if (!totalAmount || totalAmount <= 0) { result.obligationsUnmatched++; continue; }

      const { data: existing } = await supabase
        .from('commitments')
        .select('id')
        .eq('workspace_id', workspace.id)
        .eq('external_reference', reference)
        .maybeSingle();

      const patch = {
        status: o.CancelDate ? 'cancelled' : 'active',
        bounced_count: Number(o.NotPassedPayments) || 0,
        start_date: safeDate(o.StartDate),
        end_date: safeDate(o.EndDate),
      };

      if (existing) {
        await supabase.from('commitments').update(patch).eq('id', existing.id);
        result.obligationsUpdated++;
      } else {
        await supabase.from('commitments').insert({
          contact_id: contact.id, workspace_id: workspace.id,
          total_amount: totalAmount, installments_count: Number(o.NumPayments) || 1,
          external_reference: reference, created_by: user.id,
          ...patch,
        });
        result.obligationsCreated++;
      }
    } catch {
      result.obligationsUnmatched++;
    }
  }

  return result;
}
