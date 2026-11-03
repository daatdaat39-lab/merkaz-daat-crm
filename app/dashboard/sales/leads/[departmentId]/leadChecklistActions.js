'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { convertLead } from './leadLockActions';

// פעולות-הצ'קליסט בשלב "פרטים טכניים" (מסלול-הצלחה-מורחב, migration 0174) -
// שלב-ביניים-תיעודי לפני ה-RPC convert_lead_to_purchase הקיים (לא-נוגעים-
// בו). כל-הפעולות עושות upsert חלקי על contact_department_id (unique) -
// שולחות-רק-את-השדות-שהשתנו, כדי-שלא-לדרוס-שדות-אחרים-שכבר-מולאו.

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireMemberOfLead(supabase, userId, departmentId) {
  const { data: row } = await supabase.from('contact_departments').select('id, workspace_id, course_id').eq('id', departmentId).maybeSingle();
  if (!row) return { error: 'הליד לא נמצא' };
  const allowed = await isMemberOfWorkspace(supabase, userId, row.workspace_id);
  if (!allowed) return { error: 'אין לך גישה לליד הזה' };
  return { row };
}

async function upsertChecklist(supabase, departmentId, workspaceId, userId, patch) {
  const { error } = await supabase.from('lead_conversion_checklist').upsert(
    {
      contact_department_id: departmentId,
      workspace_id: workspaceId,
      updated_at: new Date().toISOString(),
      updated_by: userId,
      ...patch,
    },
    { onConflict: 'contact_department_id' }
  );
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateLeadTrack(departmentId, trackId) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, { track_id: trackId || null });
}

export async function updateLeadForms(departmentId, { link, done, sentAt }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const patch = {};
  if (link !== undefined) patch.forms_link = link || null;
  if (done !== undefined) {
    patch.forms_done = !!done;
    patch.forms_done_at = done ? new Date().toISOString() : null;
  }
  // sentAt - מתמלא-אוטומטית אחרי-שליחה-מוצלחת (מייל/וואטסאפ) מתוך
  // מסך-הרישום, לא-ע"י-הנציג-ידנית - ר' LeadRegistrationScreen.js.
  if (sentAt !== undefined) patch.forms_sent_at = sentAt;
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}

export async function updateLeadPayment(departmentId, { totalAmount, installmentsCount, method, note, arranged }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const patch = {};
  if (totalAmount !== undefined) patch.payment_total_amount = totalAmount === '' || totalAmount === null ? null : Number(totalAmount);
  if (installmentsCount !== undefined) patch.payment_installments_count = installmentsCount === '' || installmentsCount === null ? null : Number(installmentsCount);
  if (method !== undefined) patch.payment_method = method || null;
  if (note !== undefined) patch.payment_note = note || null;
  if (arranged !== undefined) {
    patch.payment_arranged = !!arranged;
    patch.payment_arranged_at = arranged ? new Date().toISOString() : null;
  }
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}

export async function updateLeadSignatures(departmentId, { link, done, note, sentAt }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const patch = {};
  if (link !== undefined) patch.signatures_link = link || null;
  if (note !== undefined) patch.signatures_note = note || null;
  if (done !== undefined) {
    patch.signatures_done = !!done;
    patch.signatures_done_at = done ? new Date().toISOString() : null;
  }
  if (sentAt !== undefined) patch.signatures_sent_at = sentAt;
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}

// אישור-המרה מפורש (מסך-רישום נפרד) - נקרא **רק** מכפתור-"סיום רישום"
// הייעודי, בלחיצה-מכוונת-ונפרדת (לא-מכל-סימון-צ'קבוקס) - בדיוק כדי-
// שלא-יקרה-שוב מה-שקרה-בפועל (קליק-בטעות-על-צ'קבוקס שיצר-מצב-לא-מכוון).
// בדיקה-כפולה בצד-שרת (לא-סומכים-רק-על-כפתור-מנוטרל-בצד-לקוח) + בלם-
// אפליקטיבי-לאידמפוטנטיות (בדיקת-קיום-שורה, מראה ensureCoursePurchaseOnWin
// ב-contacts/actions.js) - גב-נוסף-מעל אינדקס-ה-DB (migration 0176).
// שימוש-חוזר-מלא ב-convertLead/convert_lead_to_purchase הקיימים - אין-
// שכפול-לוגיקת-ה-RPC. שדה-המחיר-בצ'קליסט (payment_total_amount) הוא-
// מקור-האמת-היחיד למחיר שנשמר ב-course_purchases - לא-עוד-שדה-כפול.
export async function completeLeadRegistration(departmentId) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  if (!row.course_id) return { error: 'יש לבחור קורס לפני סיום הרישום' };

  const [{ data: course }, { data: checklist }, { data: existingPurchases }] = await Promise.all([
    supabase.from('courses').select('checklist_forms_enabled, checklist_payment_enabled, checklist_signatures_enabled').eq('id', row.course_id).maybeSingle(),
    supabase.from('lead_conversion_checklist').select('*, course_tracks:track_id (label)').eq('contact_department_id', departmentId).maybeSingle(),
    // .limit(1) + אורך-מערך, לא .maybeSingle() - אם-יש-כבר-כמה-שורות-
    // היסטוריות (לפני-אינדקס-הייחוד, migration 0176) זה-לא-אמור-לזרוק.
    supabase.from('course_purchases').select('id').eq('contact_department_id', departmentId).limit(1),
  ]);

  if (existingPurchases?.length > 0) return { error: 'ההרשמה הזו כבר נקלטה' };
  if (course?.checklist_forms_enabled !== false && !checklist?.forms_done) return { error: 'יש לסמן את טפסי הרישום כהושלמו' };
  if (course?.checklist_payment_enabled !== false && !checklist?.payment_arranged) return { error: 'יש לסמן את הסדר התשלומים כהושלם' };
  if (course?.checklist_signatures_enabled !== false && !checklist?.signatures_done) return { error: 'יש לסמן את החתימות כהושלמו' };

  return convertLead(departmentId, {
    price: checklist?.payment_total_amount ?? null,
    cohortLabel: checklist?.course_tracks?.label || null,
  });
}
