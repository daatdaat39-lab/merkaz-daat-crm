'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '../../../lib/supabase/admin';
import { validateDocumentFile, cleanFilename } from '../../dashboard/lib/documentUploads';

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
    .select('id, contact_department_id, registration_answers, contact_departments:contact_department_id (course_id, contact_id, workspace_id)')
    .eq('public_token', token)
    .maybeSingle();
  return data;
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
    return { success: true };
  });
}
