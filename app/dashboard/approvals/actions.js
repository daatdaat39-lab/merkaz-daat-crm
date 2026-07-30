'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// יצירת בקשת אישור חדשה - נשלחת מנציג אחד לאחר, קשורה למשימה או לפגישה
// ספציפית (בדיוק אחת מהשתיים)
export async function createApprovalRequest({ taskId, meetingId, requestedTo, note }) {
  const { supabase, user } = await requireUser();
  if (!requestedTo) return { error: 'יש לבחור נציג' };
  if (!taskId && !meetingId) return { error: 'חסר קישור למשימה או לפגישה' };

  const { error } = await supabase.from('approval_requests').insert({
    task_id: taskId || null,
    meeting_id: meetingId || null,
    requested_by: user.id,
    requested_to: requestedTo,
    note: note || null,
    status: 'pending',
  });
  if (error) return { error: error.message };

  revalidatePath('/dashboard/approvals');
  return { success: true };
}

// תגובת הנמען - אישור סופי, או "צריך פרטים נוספים" עם הערה חוזרת לשולח
export async function respondApprovalRequest(requestId, { approve, responseNote }) {
  const { supabase, user } = await requireUser();

  const { data: reqRow } = await supabase.from('approval_requests').select('requested_to').eq('id', requestId).single();
  if (!reqRow) return { error: 'הבקשה לא נמצאה' };
  if (reqRow.requested_to !== user.id) return { error: 'רק הנציג שהתבקש יכול להגיב לבקשה זו' };

  const { error } = await supabase.from('approval_requests').update({
    status: approve ? 'approved' : 'needs_info',
    response_note: approve ? null : (responseNote || null),
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/approvals');
  return { success: true };
}

// שליחה מחדש ע"י השולח המקורי (אחרי שעדכן פרטים בעקבות "צריך פרטים נוספים") -
// מאפסת לסטטוס pending עם הערה מעודכנת, בלולאה עד שהנמען מאשר
export async function resendApprovalRequest(requestId, note) {
  const { supabase, user } = await requireUser();

  const { data: reqRow } = await supabase.from('approval_requests').select('requested_by').eq('id', requestId).single();
  if (!reqRow) return { error: 'הבקשה לא נמצאה' };
  if (reqRow.requested_by !== user.id) return { error: 'רק השולח המקורי יכול לשלוח מחדש' };

  const { error } = await supabase.from('approval_requests').update({
    status: 'pending',
    note: note || null,
    response_note: null,
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/approvals');
  return { success: true };
}
