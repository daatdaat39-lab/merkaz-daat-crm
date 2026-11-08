'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '../../../lib/supabase/admin';
import { validateDocumentFile, cleanFilename } from '../../dashboard/lib/documentUploads';
import { isPublicLinkExpired } from '../../dashboard/lib/publicLink';
import { israelYmd } from '../../dashboard/lib/time';

const DOCUMENTS_BUCKET = 'contact-documents';
const MAX_ANSWER_LENGTH = 2000;
const MAX_SIGNATURE_BYTES = 1024 * 1024;
const GENERIC_ERROR = 'אירעה תקלה בשמירה, נסו שוב בעוד רגע';

// משטח-ציבורי (בלי-session, בלי-RLS) - כל-פעולה-כאן פותרת-מחדש את-
// השורה-מה-token עצמו (לעולם-לא-סומכת-על-מזהים-שמגיעים-מהלקוח) ומוודאת
// שכל-מה-שנכתב (שאלה/דרישת-מסמך) באמת-שייך-לקורס-של-השורה-הזו. admin-
// client בלבד - אין-כאן-שום-מושג-של-auth.uid(), ה-RLS-הרגיל (auth.uid()
// is not null) לא-היה-מאפשר-גישה-בכלל.
async function resolveByToken(admin, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const { data } = await admin
    .from('lead_conversion_checklist')
    .select('id, contact_department_id, registration_answers, public_token_created_at, contact_departments:contact_department_id (course_id, contact_id, workspace_id, agent_id, contacts:contact_id (frozen))')
    .eq('public_token', token)
    .maybeSingle();
  if (!data) return null;
  // אותם כללים כמו בעמוד עצמו: קישור שפג תוקפו, איש קשר מוקפא, או הרשמה
  // שכבר הושלמה (רכישה שלא בוטלה) - לא ניתן לכתוב דרכו יותר.
  if (isPublicLinkExpired(data.public_token_created_at)) return null;
  if (data.contact_departments?.contacts?.frozen) return null;
  const { data: purchase } = await admin
    .from('course_purchases').select('id')
    .eq('contact_department_id', data.contact_department_id).neq('status', 'cancelled').limit(1);
  if (purchase?.length) return null;
  return data;
}

// כשהלקוח משלים את כל שדות החובה - נפתחת משימה לנציג המטפל ("הלקוח סיים
// למלא, לבדוק ולסיים רישום"), כדי שהנציג לא יצטרך לבדוק ידנית מי התקדם.
// עובדת בשקט (כשל כאן לא פוגע בשמירת הלקוח), ולא יוצרת משימה כפולה.
async function notifyAgentIfComplete(admin, row) {
  try {
    const dept = row.contact_departments;
    if (!dept?.course_id) return;
    const [{ data: fields }, { data: checklist }, { data: docs }] = await Promise.all([
      admin.from('course_form_fields').select('id, field_key, type').eq('course_id', dept.course_id).eq('is_active', true).eq('required', true),
      admin.from('lead_conversion_checklist').select('registration_answers, signatures_done').eq('id', row.id).maybeSingle(),
      admin.from('contact_documents').select('requirement_id').eq('contact_department_id', row.contact_department_id),
    ]);
    if (!fields?.length) return;
    const uploaded = new Set((docs || []).map((d) => d.requirement_id));
    const answers = checklist?.registration_answers || {};
    const missing = fields.some((f) => {
      if (f.type === 'file') return !uploaded.has(f.id);
      if (f.type === 'signature') return !checklist?.signatures_done;
      const v = answers[f.field_key];
      return v === undefined || v === null || v === '';
    });
    if (missing) return;

    const title = 'הלקוח השלים את פרטי הרישום בקישור האישי - לבדוק ולסיים רישום';
    const { data: existing } = await admin
      .from('tasks').select('id').eq('contact_id', dept.contact_id).eq('title', title).eq('done', false).limit(1);
    if (existing?.length) return;
    await admin.from('tasks').insert({
      workspace_id: dept.workspace_id, contact_id: dept.contact_id, title,
      due_date: israelYmd(), assigned_to: dept.agent_id || null, created_by: dept.agent_id || null,
    });
  } catch (e) {
    console.error('notifyAgentIfComplete failed:', e?.message || e);
  }
}

// עוטף כל פעולה ציבורית: חריגה לא צפויה (שגיאת רשת/storage/גודל) חוזרת
// ללקוח כהודעה ידידותית בעברית במקום קריסה גולמית של ה-server action.
async function safely(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('publicRegistration action failed:', e?.message || e);
    return { error: GENERIC_ERROR };
  }
}

export async function publicSaveAnswer(token, fieldKey, value) {
  return safely(async () => {
    const admin = createAdminClient();
    const row = await resolveByToken(admin, token);
    if (!row) return { error: 'קישור לא תקין' };

    const courseId = row.contact_departments?.course_id;
    const { data: field } = await admin
      .from('course_form_fields')
      .select('field_key')
      .eq('course_id', courseId)
      .eq('field_key', fieldKey)
      .eq('is_active', true)
      .maybeSingle();
    if (!field) return { error: 'שדה לא תקין' };

    const clean = typeof value === 'string' ? value.slice(0, MAX_ANSWER_LENGTH) : value;
    const merged = { ...(row.registration_answers || {}), [fieldKey]: clean };
    const { error } = await admin.from('lead_conversion_checklist').update({ registration_answers: merged }).eq('id', row.id);
    if (error) return { error: GENERIC_ERROR };
    await notifyAgentIfComplete(admin, row);
    return { success: true };
  });
}

export async function publicUploadDocument(token, requirementId, formData) {
  return safely(async () => {
    const admin = createAdminClient();
    const row = await resolveByToken(admin, token);
    if (!row) return { error: 'קישור לא תקין' };

    const courseId = row.contact_departments?.course_id;
    const { data: field } = await admin
      .from('course_form_fields')
      .select('id')
      .eq('id', requirementId)
      .eq('course_id', courseId)
      .eq('type', 'file')
      .eq('is_active', true)
      .maybeSingle();
    if (!field) return { error: 'דרישת-מסמך לא תקינה' };

    const file = formData.get('file');
    // הסוג והגודל נבדקים לפי תוכן הקובץ עצמו - ר' dashboard/lib/documentUploads.js
    const checked = await validateDocumentFile(file);
    if (checked.error) return { error: checked.error };

    const contactId = row.contact_departments?.contact_id;
    const path = `${contactId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${checked.ext}`;

    const { error: uploadError } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, file, { contentType: checked.contentType, upsert: false });
    if (uploadError) return { error: GENERIC_ERROR };

    const { error: insertError } = await admin.from('contact_documents').insert({
      contact_id: contactId,
      workspace_id: row.contact_departments?.workspace_id,
      contact_department_id: row.contact_department_id,
      requirement_id: requirementId,
      file_path: path,
      original_filename: cleanFilename(file.name),
      uploaded_by: null,
    });
    if (insertError) return { error: GENERIC_ERROR };
    await notifyAgentIfComplete(admin, row);
    return { success: true };
  });
}

// signature_ip נלכד-כאן (בניגוד-לגרסת-הנציג) - זו-הגשה-אמיתית-של-הלקוח-
// עצמו-דרך-הרשת, יש-ערך-ראייתי-קל-למשקל-לדעת-מאיפה-זה-הגיע.
export async function publicSubmitSignature(token, { typedName, agreed, imageDataUrl }) {
  return safely(async () => {
    const admin = createAdminClient();
    const row = await resolveByToken(admin, token);
    if (!row) return { error: 'קישור לא תקין' };
    if (!agreed || !typedName?.trim()) return { error: 'יש להקליד שם ולאשר את התנאים' };

    const match = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl || '');
    if (!match) return { error: 'חתימה לא תקינה' };
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > MAX_SIGNATURE_BYTES) return { error: 'החתימה גדולה מדי' };
    // PNG אמיתי בלבד (89 50 4E 47) - לא נסמכים על הקידומת data:image/png
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return { error: 'חתימה לא תקינה' };
    }

    const contactId = row.contact_departments?.contact_id;
    const path = `${contactId}/${Date.now()}-signature.png`;
    const { error: uploadError } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: 'image/png', upsert: true });
    if (uploadError) return { error: GENERIC_ERROR };

    const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const { error } = await admin.from('lead_conversion_checklist').update({
      signature_image_path: path,
      signature_typed_name: typedName.trim().slice(0, 120),
      signature_ip: ip,
      signatures_done: true,
      signatures_done_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) return { error: GENERIC_ERROR };
    await notifyAgentIfComplete(admin, row);
    return { success: true };
  });
}
