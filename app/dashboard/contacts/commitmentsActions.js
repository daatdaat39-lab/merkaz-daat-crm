'use server';

// פעולות שרת ל"התחייבויות" (commitments, מיגרציה 0049) - מעקב הבטחת
// סכום כולל מול מה ששולם בפועל, גנרי לכל מחלקה. בשונה מ-
// updateDepartmentExtraField (פתוחה לכל משתמש מחובר), זו תכונת ניהול
// כסף - כל פעולת כתיבה דורשת owner/admin של המחלקה הספציפית.
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace, requireNotFrozen } from '../lib/contactGuards';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireCommitmentManager(supabase, userId, workspaceId) {
  const allowed = await isManagerOfWorkspace(supabase, userId, workspaceId);
  if (!allowed) return { error: 'רק בעלים/מנהל של המחלקה יכול לנהל התחייבויות' };
  return null;
}

export async function createCommitment(contactId, workspaceId, { totalAmount, installmentsCount, note }) {
  const { supabase, user } = await requireUser();
  const guardError = await requireCommitmentManager(supabase, user.id, workspaceId);
  if (guardError) return guardError;

  const amount = Number(totalAmount);
  const installments = Number(installmentsCount) || 1;
  if (!amount || amount <= 0) return { error: 'סכום ההתחייבות חייב להיות גדול מאפס' };
  if (installments < 1) return { error: 'מספר תשלומים לא תקין' };

  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { data: commitment, error } = await supabase
    .from('commitments')
    .insert({
      contact_id: contactId, workspace_id: workspaceId,
      total_amount: amount, installments_count: installments,
      note: (note || '').trim() || null, status: 'active', created_by: user.id,
    })
    .select('*').single();
  if (error) return { error: error.message };
  return { success: true, commitment };
}

// קריאה בלבד - אותו רף הרשאה כמו קריאת תנועות תרומה קיימות (לא דורש
// מנהל, כל משתמש מחובר יכול לראות את מצב ההתחייבויות של איש קשר)
export async function listCommitments(contactId) {
  const { supabase } = await requireUser();
  const { data: commitments } = await supabase
    .from('commitments').select('*').eq('contact_id', contactId).order('created_at', { ascending: false });
  if (!commitments?.length) return [];

  const { data: transactions } = await supabase
    .from('donation_transactions')
    .select('id, commitment_id, amount, transaction_date, source_system')
    .in('commitment_id', commitments.map((c) => c.id));

  return commitments.map((c) => ({
    ...c,
    payments: (transactions || []).filter((t) => t.commitment_id === c.id),
  }));
}

// רישום תשלום בודד כנגד התחייבות - זו גם הדרך היחידה היום להוסיף תנועת
// תרומה ידנית בודדת (לא דרך ייבוא בכמות). מסמן fulfilled אוטומטית אם
// סכום התשלומים המקושרים הגיע לסכום ההתחייבות המלא.
export async function recordCommitmentPayment(commitmentId, { amount, transactionDate, sourceSystem }) {
  const { supabase, user } = await requireUser();
  const { data: commitment } = await supabase.from('commitments').select('*').eq('id', commitmentId).single();
  if (!commitment) return { error: 'ההתחייבות לא נמצאה' };

  const guardError = await requireCommitmentManager(supabase, user.id, commitment.workspace_id);
  if (guardError) return guardError;

  const frozenError = await requireNotFrozen(supabase, commitment.contact_id);
  if (frozenError) return frozenError;

  const payAmount = Number(amount);
  const date = (transactionDate || '').toString().trim();
  if (!payAmount || payAmount <= 0) return { error: 'סכום התשלום חייב להיות גדול מאפס' };
  if (!date) return { error: 'יש לבחור תאריך תשלום' };

  const { error: insertError } = await supabase.from('donation_transactions').insert({
    contact_id: commitment.contact_id, workspace_id: commitment.workspace_id,
    commitment_id: commitment.id, amount: payAmount, transaction_date: date,
    source_system: (sourceSystem || '').trim() || 'ידני',
  });
  if (insertError) return { error: insertError.message };

  const { data: linked } = await supabase
    .from('donation_transactions').select('amount').eq('commitment_id', commitment.id);
  const paidTotal = (linked || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  if (paidTotal >= Number(commitment.total_amount) && commitment.status === 'active') {
    await supabase.from('commitments').update({ status: 'fulfilled' }).eq('id', commitment.id);
  }

  return { success: true };
}

export async function linkTransactionToCommitment(transactionId, commitmentId) {
  const { supabase, user } = await requireUser();
  const { data: commitment } = await supabase.from('commitments').select('id, contact_id, workspace_id').eq('id', commitmentId).single();
  if (!commitment) return { error: 'ההתחייבות לא נמצאה' };
  const guardError = await requireCommitmentManager(supabase, user.id, commitment.workspace_id);
  if (guardError) return guardError;

  const { data: txn } = await supabase.from('donation_transactions').select('id, contact_id').eq('id', transactionId).single();
  if (!txn) return { error: 'התנועה לא נמצאה' };
  if (txn.contact_id !== commitment.contact_id) return { error: 'התנועה שייכת לאיש קשר אחר' };

  const { error } = await supabase.from('donation_transactions').update({ commitment_id: commitmentId }).eq('id', transactionId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkTransactionFromCommitment(transactionId) {
  const { supabase, user } = await requireUser();
  const { data: txn } = await supabase.from('donation_transactions').select('id, workspace_id').eq('id', transactionId).single();
  if (!txn) return { error: 'התנועה לא נמצאה' };
  const guardError = await requireCommitmentManager(supabase, user.id, txn.workspace_id);
  if (guardError) return guardError;

  const { error } = await supabase.from('donation_transactions').update({ commitment_id: null }).eq('id', transactionId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function cancelCommitment(commitmentId) {
  const { supabase, user } = await requireUser();
  const { data: commitment } = await supabase.from('commitments').select('id, workspace_id, status').eq('id', commitmentId).single();
  if (!commitment) return { error: 'ההתחייבות לא נמצאה' };
  const guardError = await requireCommitmentManager(supabase, user.id, commitment.workspace_id);
  if (guardError) return guardError;
  if (commitment.status === 'cancelled') return { error: 'ההתחייבות כבר מבוטלת' };

  const { error } = await supabase.from('commitments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', commitmentId);
  if (error) return { error: error.message };
  return { success: true };
}
