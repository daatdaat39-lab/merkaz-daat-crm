'use server';

import crypto from 'crypto';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { validateDocumentFile, cleanFilename, isPathOfContact } from '../../../lib/documentUploads';
import { convertLead } from './leadLockActions';

const DOCUMENTS_BUCKET = 'contact-documents';

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
  const { data: row } = await supabase.from('contact_departments').select('id, workspace_id, course_id, contact_id').eq('id', departmentId).maybeSingle();
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

export async function updateLeadPayment(departmentId, { totalAmount, installmentsCount, method, note, arranged, paymentLink, paymentLinkSentAt }) {
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
  // קישור-תשלום-חיצוני (Kesher, migration 0181) - seed חד-פעמי מ-
  // courses.payment_page_url, נציג יכול-לערוך; paymentLinkSentAt מתמלא
  // אוטומטית-אחרי-שליחה-מוצלחת, אותו-דפוס-בדיוק כמו forms/signatures.
  if (paymentLink !== undefined) patch.payment_link = paymentLink || null;
  if (paymentLinkSentAt !== undefined) patch.payment_link_sent_at = paymentLinkSentAt;
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, patch);
}

// שאלות-רישום-דינמיות (migration 0177) - תשובה-בודדת ממוזגת לתוך
// registration_answers (jsonb {field_key: value}) - קריאה-ואז-כתיבה
// (לא-פאץ'-ישיר), כי אי-אפשר-למזג-jsonb-חלקי דרך upsertChecklist
// הגנרית בלי-לדרוס-מפתחות-אחרים שכבר-מולאו.
export async function updateLeadRegistrationAnswer(departmentId, fieldKey, value) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  const { data: existing } = await supabase.from('lead_conversion_checklist').select('registration_answers').eq('contact_department_id', departmentId).maybeSingle();
  const merged = { ...(existing?.registration_answers || {}), [fieldKey]: value };
  return upsertChecklist(supabase, departmentId, row.workspace_id, user.id, { registration_answers: merged });
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

// מסמכים (migration 0180, contact_documents) - טבלה-משותפת-לכל-המערכת
// (contact_id, לא-רק-department) - כאן נכתב-תמיד-עם-contact_department_id
// +requirement_id ממולאים (העלאה-מתוך-ליד-ספציפי), כך-שאותה-שורה-מופיעה-
// גם-בטאב-"מסמכים"-הכללי בכרטיס-איש-קשר (ContactTabs.js). bucket פרטי -
// upload+קריאה תמיד-עם admin-client + createSignedUrl, לעולם-לא getPublicUrl.
export async function uploadLeadDocumentByAgent(departmentId, requirementId, formData) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };

  const file = formData.get('file');
  // הסוג נקבע לפי תוכן הקובץ עצמו - ר' lib/documentUploads.js
  const checked = await validateDocumentFile(file);
  if (checked.error) return { error: checked.error };

  // requirementId חייב להיות שדה-קובץ פעיל של הקורס של הליד הזה - בלי הבדיקה
  // אפשר היה לשייך מסמך לדרישה של קורס אחר ולעוות את בדיקת "סיום רישום".
  if (requirementId) {
    const { data: field } = await supabase.from('course_form_fields').select('id').eq('id', requirementId).eq('course_id', row.course_id).eq('type', 'file').maybeSingle();
    if (!field) return { error: 'דרישת-מסמך לא תקינה' };
  }

  const admin = createAdminClient();
  const path = `${row.contact_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${checked.ext}`;

  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: checked.contentType, upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await admin.from('contact_documents').insert({
    contact_id: row.contact_id,
    workspace_id: row.workspace_id,
    contact_department_id: departmentId,
    requirement_id: requirementId || null,
    file_path: path,
    original_filename: cleanFilename(file.name),
    uploaded_by: user.id,
  });
  if (insertError) return { error: insertError.message };
  return { success: true };
}

// חתימת URL רק לקובץ ששייך לליד הזה: מסמך רשום ב-contact_documents של
// אותו איש-קשר, או תמונת-החתימה של הצ'קליסט של אותו ליד. נתיב אחר (כולל
// קובץ של איש-קשר אחר) נדחה - בלי זה כל חבר-מחלקה יכול היה לבקש URL חתום
// לכל קובץ ב-bucket הפרטי.
export async function getSignedLeadFileUrl(departmentId, filePath) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  if (!isPathOfContact(row.contact_id, filePath)) return { error: 'קובץ לא תקין' };

  const [{ data: doc }, { data: checklist }] = await Promise.all([
    supabase.from('contact_documents').select('id').eq('contact_id', row.contact_id).eq('file_path', filePath).maybeSingle(),
    supabase.from('lead_conversion_checklist').select('signature_image_path').eq('contact_department_id', departmentId).maybeSingle(),
  ]);
  if (!doc && checklist?.signature_image_path !== filePath) return { error: 'הקובץ לא נמצא' };

  const admin = createAdminClient();
  const { data, error: signError } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(filePath, 3600);
  if (signError) return { error: signError.message };
  return { success: true, url: data.signedUrl };
}

// קישור-אישי-ציבורי ללקוח (migration 0181) - טוקן ארוך-ואקראי (לא-JWT,
// לא-time-based-expiry - רישום יכול-לקחת-כמה-ימים) נוצר-עצלנית בלחיצת-
// הנציג-הראשונה, לא-בכל-יצירת-שורת-צ'קליסט. רענון = overwrite פשוט -
// קישור-ישן מפסיק-לעבוד-מיידית (אין-טבלת-טוקנים-היסטורית, lookup הוא
// שוויון-מדויק). אם-כבר-קיים-טוקן ולא-ביקשו-regenerate - מחזיר-אותו-
// הקיים (idempotent "הבטח-שיש-קישור").
export async function updateLeadPublicToken(departmentId, { regenerate } = {}) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };

  if (!regenerate) {
    const { data: existing } = await supabase.from('lead_conversion_checklist').select('public_token').eq('contact_department_id', departmentId).maybeSingle();
    if (existing?.public_token) return { success: true, token: existing.public_token };
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const res = await upsertChecklist(supabase, departmentId, row.workspace_id, user.id, {
    public_token: token, public_token_created_at: new Date().toISOString(),
  });
  if (res.error) return res;
  return { success: true, token };
}

// חתימה דיגיטלית נלכדת-ע"י-הנציג (קנבס, SignaturePad.js) - בניגוד-
// לגרסה-הציבורית-העתידית, signature_ip נשאר null בכוונה: זו-לא-הגשה-
// של-הלקוח-עצמו-דרך-הרשת, אין-טעם-ברישום-IP-של-הנציג. נשמר **בנוסף**-
// ל-signatures_link/note הקיימים (קורס יכול-עדיין-להשתמש-בקישור-חיצוני).
export async function submitLeadSignatureByAgent(departmentId, { typedName, agreed, imageDataUrl }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (error) return { error };
  if (!agreed || !typedName?.trim()) return { error: 'יש להקליד שם ולאשר את התנאים' };

  const match = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl || '');
  if (!match) return { error: 'חתימה לא תקינה' };
  const buffer = Buffer.from(match[1], 'base64');
  // PNG אמיתי וקטן בלבד - לא נסמכים על הקידומת data:image/png שהלקוח שולח
  if (buffer.length > 1024 * 1024 || buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return { error: 'חתימה לא תקינה' };
  }

  const admin = createAdminClient();
  const path = `${row.contact_id}/${Date.now()}-signature.png`;
  const { error: uploadError } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType: 'image/png', upsert: true });
  if (uploadError) return { error: uploadError.message };

  const signedAt = new Date().toISOString();
  const res = await upsertChecklist(supabase, departmentId, row.workspace_id, user.id, {
    signature_image_path: path,
    signature_typed_name: typedName.trim(),
    signature_ip: null,
    signatures_done: true,
    signatures_done_at: signedAt,
  });
  if (res.error) return res;
  // מחזיר את הנתונים-החדשים-בפועל (לא-רק {success:true}) - הצד-הלקוח
  // מעדכן state-מקומי מיידית מתוכם, כי useState-הראשוני לא-מתעדכן-לבד
  // מ-router.refresh() בלי-remount (אין-key-חדש לקומפוננטה).
  return { success: true, path, typedName: typedName.trim(), signedAt };
}

// רמז-התאמת-תשלום רך (לא-אישור-אוטומטי!) - קריאה-בלבד מול
// donation_transactions שכבר-מסתנכרנות מקשר (READ-ONLY-לצמיתות, אין-
// webhook/דף-תשלום-אמיתי). התאמה-היוריסטית: אותו-contact_id, תאריך
// אחרי-יצירת-הליד, סכום בטווח-±10%. המטרה - רמז-בלבד למסך-הרישום;
// checklist.payment_arranged (צ'קבוקס-ידני) נשאר מקור-האמת-היחיד.
export async function findPossiblePaymentMatch(contactId, leadCreatedAt, approxAmount) {
  const amount = Number(approxAmount);
  if (!contactId || !leadCreatedAt || !amount) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from('donation_transactions')
    .select('amount, transaction_date')
    .eq('contact_id', contactId)
    .gte('transaction_date', leadCreatedAt.slice(0, 10))
    .gte('amount', amount * 0.9)
    .lte('amount', amount * 1.1)
    .order('transaction_date', { ascending: true })
    .limit(1);
  return data?.[0] || null;
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

  const [{ data: course }, { data: checklist }, { data: existingPurchases }, { data: requiredFields }, { data: uploadedDocs }] = await Promise.all([
    supabase.from('courses').select('checklist_forms_enabled, checklist_payment_enabled').eq('id', row.course_id).maybeSingle(),
    supabase.from('lead_conversion_checklist').select('*, course_tracks:track_id (label)').eq('contact_department_id', departmentId).maybeSingle(),
    // .limit(1) + אורך-מערך, לא .maybeSingle() - אם-יש-כבר-כמה-שורות-
    // היסטוריות (לפני-אינדקס-הייחוד, migration 0176) זה-לא-אמור-לזרוק.
    // רכישה-שבוטלה (cancelCoursePurchase למטה) לא-אמורה-לחסום-רישום-
    // חוזר - בלעדי-זה, ליד-שבוטל-בו-רישום-בטעות היה-נתקע-לנצח.
    supabase.from('course_purchases').select('id').eq('contact_department_id', departmentId).neq('status', 'cancelled').limit(1),
    // מערכת-טפסים-בסיסית (migration 0182) - בדיקה-אחת-מאוחדת על-כל-type
    // (טקסט/מספר/תאריך/בחירה/קובץ/חתימה) במקום-3-בדיקות-נפרדות-בעבר.
    supabase.from('course_form_fields').select('id, field_key, label, type').eq('course_id', row.course_id).eq('is_active', true).eq('required', true),
    supabase.from('contact_documents').select('requirement_id').eq('contact_department_id', departmentId),
  ]);

  if (existingPurchases?.length > 0) return { error: 'ההרשמה הזו כבר נקלטה' };
  if (course?.checklist_forms_enabled !== false && !checklist?.forms_done) return { error: 'יש לסמן את טפסי הרישום כהושלמו' };
  if (course?.checklist_payment_enabled !== false && !checklist?.payment_arranged) return { error: 'יש לסמן את הסדר התשלומים כהושלם' };

  const answers = checklist?.registration_answers || {};
  const uploadedRequirementIds = new Set((uploadedDocs || []).map((d) => d.requirement_id));
  const missingLabels = (requiredFields || [])
    .filter((f) => {
      if (f.type === 'file') return !uploadedRequirementIds.has(f.id);
      if (f.type === 'signature') return !checklist?.signatures_done;
      const v = answers[f.field_key];
      return v === undefined || v === null || v === '';
    })
    .map((f) => f.label);
  if (missingLabels.length > 0) return { error: `יש להשלים: ${missingLabels.join(', ')}` };

  return convertLead(departmentId, {
    price: checklist?.payment_total_amount ?? null,
    cohortLabel: checklist?.course_tracks?.label || null,
  });
}

// ביטול-רישום (מסך-הרישום, כש-כבר-יש-רכישה-לליד-הזה) - למקרה-של-לחיצה-
// בטעות (ר' דיון "תקלה במעבר-שלב" - בעבר קרה-בפועל). מסמנת status='cancelled'
// בלבד - **לא-מוחקת**, נשאר-תיעוד-היסטורי. **לא-משנה** את contact_departments.
// stage (הוכרע-במפורש) - הנציג-בוחר-שלב-חדש-ידנית-בעצמו, בלי-ניחוש.
export async function cancelCoursePurchase(departmentId, purchaseId) {
  const { supabase, user } = await requireUser();
  const { error: accessError } = await requireMemberOfLead(supabase, user.id, departmentId);
  if (accessError) return { error: accessError };

  const { error } = await supabase.from('course_purchases')
    .update({ status: 'cancelled' })
    .eq('id', purchaseId)
    .eq('contact_department_id', departmentId);
  if (error) return { error: error.message };
  return { success: true };
}
