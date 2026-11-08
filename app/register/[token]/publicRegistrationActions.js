'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '../../../lib/supabase/admin';

const DOCUMENTS_BUCKET = 'contact-documents';

// משטח-ציבורי (בלי-session, בלי-RLS) - כל-פעולה-כאן פותרת-מחדש את-
// השורה-מה-token עצמו (לעולם-לא-סומכת-על-מזהים-שמגיעים-מהלקוח) ומוודאת
// שכל-מה-שנכתב (שאלה/דרישת-מסמך) באמת-שייך-לקורס-של-השורה-הזו. admin-
// client בלבד - אין-כאן-שום-מושג-של-auth.uid(), ה-RLS-הרגיל (auth.uid()
// is not null) לא-היה-מאפשר-גישה-בכלל.
async function resolveByToken(admin, token) {
  if (!token) return null;
  const { data } = await admin
    .from('lead_conversion_checklist')
    .select('id, contact_department_id, registration_answers, contact_departments:contact_department_id (course_id, contact_id, workspace_id)')
    .eq('public_token', token)
    .maybeSingle();
  return data;
}

export async function publicSaveAnswer(token, fieldKey, value) {
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

  const merged = { ...(row.registration_answers || {}), [fieldKey]: value };
  const { error } = await admin.from('lead_conversion_checklist').update({ registration_answers: merged }).eq('id', row.id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function publicUploadDocument(token, requirementId, formData) {
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
  if (!file || typeof file === 'string' || file.size === 0) return { error: 'יש לבחור קובץ' };

  const contactId = row.contact_departments?.contact_id;
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const path = `${contactId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await admin.from('contact_documents').insert({
    contact_id: contactId,
    workspace_id: row.contact_departments?.workspace_id,
    contact_department_id: row.contact_department_id,
    requirement_id: requirementId,
    file_path: path,
    original_filename: file.name || null,
    uploaded_by: null,
  });
  if (insertError) return { error: insertError.message };
  return { success: true };
}

// signature_ip נלכד-כאן (בניגוד-לגרסת-הנציג) - זו-הגשה-אמיתית-של-הלקוח-
// עצמו-דרך-הרשת, יש-ערך-ראייתי-קל-למשקל-לדעת-מאיפה-זה-הגיע.
export async function publicSubmitSignature(token, { typedName, agreed, imageDataUrl }) {
  const admin = createAdminClient();
  const row = await resolveByToken(admin, token);
  if (!row) return { error: 'קישור לא תקין' };
  if (!agreed || !typedName?.trim()) return { error: 'יש להקליד שם ולאשר את התנאים' };

  const match = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl || '');
  if (!match) return { error: 'חתימה לא תקינה' };
  const buffer = Buffer.from(match[1], 'base64');

  const contactId = row.contact_departments?.contact_id;
  const path = `${contactId}/${Date.now()}-signature.png`;
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: true });
  if (uploadError) return { error: uploadError.message };

  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const { error } = await admin.from('lead_conversion_checklist').update({
    signature_image_path: path,
    signature_typed_name: typedName.trim(),
    signature_ip: ip,
    signatures_done: true,
    signatures_done_at: new Date().toISOString(),
  }).eq('id', row.id);
  if (error) return { error: error.message };
  return { success: true };
}
