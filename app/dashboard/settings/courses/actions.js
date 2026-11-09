'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';

// courses הוא קטלוג גלובלי (לא per-מחלקה, ר' migration 0148) - owner/admin
// של כל מחלקה יכול לנהל אותו, אותו דפוס-הרשאה כמו settings/reference-content.
async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin יכול לערוך את קטלוג הקורסים' };
  return { supabase };
}

export async function createCourse({
  name, code, description, price, durationType, durationDays,
  checklistFormsEnabled, checklistPaymentEnabled, checklistSignaturesEnabled, checklistDocumentsEnabled,
  registrationFormUrl, signatureTemplateUrl, paymentPageUrl,
}) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const cleanName = (name || '').trim();
  if (!cleanName) return { error: 'יש להזין שם קורס' };

  const { count } = await supabase.from('courses').select('id', { count: 'exact', head: true });
  const { error } = await supabase.from('courses').insert({
    name: cleanName,
    code: (code || '').trim() || null,
    description: (description || '').trim() || null,
    price: price === '' || price === null || price === undefined ? null : Number(price),
    duration_type: durationType || 'fixed_dates',
    duration_days: durationType === 'duration_from_purchase' && durationDays ? Number(durationDays) : null,
    sort_order: (count || 0) * 10,
    checklist_forms_enabled: checklistFormsEnabled !== false,
    checklist_payment_enabled: checklistPaymentEnabled !== false,
    checklist_signatures_enabled: checklistSignaturesEnabled !== false,
    checklist_documents_enabled: checklistDocumentsEnabled !== false,
    registration_form_url: (registrationFormUrl || '').trim() || null,
    signature_template_url: (signatureTemplateUrl || '').trim() || null,
    payment_page_url: (paymentPageUrl || '').trim() || null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateCourse(id, {
  name, code, description, price, durationType, durationDays, isActive,
  checklistFormsEnabled, checklistPaymentEnabled, checklistSignaturesEnabled, checklistDocumentsEnabled,
  registrationFormUrl, signatureTemplateUrl, paymentPageUrl,
}) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const changes = {};
  if (name !== undefined) {
    if (!name.trim()) return { error: 'שם קורס לא יכול להיות ריק' };
    changes.name = name.trim();
  }
  if (code !== undefined) changes.code = code.trim() || null;
  if (description !== undefined) changes.description = description.trim() || null;
  if (price !== undefined) changes.price = price === '' ? null : Number(price);
  if (durationType !== undefined) changes.duration_type = durationType;
  if (durationDays !== undefined) changes.duration_days = durationType === 'duration_from_purchase' && durationDays ? Number(durationDays) : null;
  if (isActive !== undefined) changes.is_active = isActive;
  if (checklistFormsEnabled !== undefined) changes.checklist_forms_enabled = checklistFormsEnabled;
  if (checklistPaymentEnabled !== undefined) changes.checklist_payment_enabled = checklistPaymentEnabled;
  if (checklistSignaturesEnabled !== undefined) changes.checklist_signatures_enabled = checklistSignaturesEnabled;
  if (checklistDocumentsEnabled !== undefined) changes.checklist_documents_enabled = checklistDocumentsEnabled;
  if (registrationFormUrl !== undefined) changes.registration_form_url = registrationFormUrl.trim() || null;
  if (signatureTemplateUrl !== undefined) changes.signature_template_url = signatureTemplateUrl.trim() || null;
  if (paymentPageUrl !== undefined) changes.payment_page_url = paymentPageUrl.trim() || null;

  const { error } = await supabase.from('courses').update(changes).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// מסלולים (בוקר/ערב/זום וכו') - גמישים-לכל-קורס בנפרד (migration 0173).
// "השבתה" בלבד, בלי מחיקה - אותה מוסכמה כמו toggleActive לקורס עצמו, כדי
// שלא-לייתם בחירת-מסלול קיימת של ליד (lead_conversion_checklist.track_id).
export async function createCourseTrack(courseId, label) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const cleanLabel = (label || '').trim();
  if (!cleanLabel) return { error: 'יש להזין שם מסלול' };

  const { count } = await supabase.from('course_tracks').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  const { error } = await supabase.from('course_tracks').insert({
    course_id: courseId,
    label: cleanLabel,
    sort_order: (count || 0) * 10,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateCourseTrack(id, { label, isActive, startDate, endDate }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const changes = {};
  if (label !== undefined) {
    if (!label.trim()) return { error: 'שם מסלול לא יכול להיות ריק' };
    changes.label = label.trim();
  }
  if (isActive !== undefined) changes.is_active = isActive;
  // תאריכי המסלול (migration 0189): התחלה משמשת למעבר האוטומטי "נרשם" <- "תלמיד
  // פעיל", והשניים נכתבים להרשמה בסיום רישום. ריק = מנקה.
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate !== undefined) {
    if (startDate && !DATE.test(startDate)) return { error: 'תאריך התחלה לא תקין' };
    changes.start_date = startDate || null;
  }
  if (endDate !== undefined) {
    if (endDate && !DATE.test(endDate)) return { error: 'תאריך סיום לא תקין' };
    changes.end_date = endDate || null;
  }

  const { error } = await supabase.from('course_tracks').update(changes).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// מערכת-טפסים-בסיסית (migration 0182) - רשימה-אחת-מסודרת-עם-type
// במקום-שלוש-רשימות-נפרדות (שאלות/מסמכים/חתימה-קבועה) - מאפשרת-סדר-
// חופשי (שאלה→מסמך→שאלה→חתימה, לא-רק-3-בלוקים-קבועים). אותו-דפוס-
// הרשאה/השבתה כמו-course_tracks/השאלות-הישנות. type='file'/'signature'
// לא-צריכים-options (רק type='select'). השבתה-בלבד - תשובות/מסמכים-
// שכבר-נשמרו (registration_answers/contact_documents) לא-יתייתמו.
export async function createCourseFormField(courseId, { fieldKey, label, type, options, required }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const key = (fieldKey || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const lbl = (label || '').trim();
  if (!key || !lbl) return { error: 'יש להזין מפתח טכני ותווית' };

  const { count } = await supabase.from('course_form_fields').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  const { error } = await supabase.from('course_form_fields').insert({
    course_id: courseId,
    field_key: key,
    label: lbl,
    type: type || 'text',
    options: type === 'select' ? (options || []) : [],
    required: !!required,
    sort_order: (count || 0) * 10,
  });
  if (error) return { error: error.code === '23505' ? 'מפתח זה כבר קיים לקורס הזה' : error.message };
  return { success: true };
}

export async function updateCourseFormField(id, { label, options, required, isActive }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const changes = {};
  if (label !== undefined) {
    if (!label.trim()) return { error: 'תווית לא יכולה להיות ריקה' };
    changes.label = label.trim();
  }
  if (options !== undefined) changes.options = options;
  if (required !== undefined) changes.required = !!required;
  if (isActive !== undefined) changes.is_active = isActive;

  const { error } = await supabase.from('course_form_fields').update(changes).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// סידור-מחדש - מחליף sort_order עם-השכן-בכיוון-המבוקש (לא-drag&drop,
// מספיק-ל"בסיס"). קורא-את-הרשימה-המלאה-של-הקורס-ממוינת, מאתר-את-
// המיקום-הנוכחי, ומחליף עם-הקודם/הבא - פעולה-אחת-פשוטה-ובטוחה.
export async function reorderCourseFormField(id, direction) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data: field } = await supabase.from('course_form_fields').select('id, course_id, sort_order').eq('id', id).maybeSingle();
  if (!field) return { error: 'השדה לא נמצא' };

  const { data: siblings } = await supabase
    .from('course_form_fields')
    .select('id, sort_order')
    .eq('course_id', field.course_id)
    .order('sort_order', { ascending: true });
  const idx = (siblings || []).findIndex((f) => f.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return { success: true };
  const neighbor = siblings[swapIdx];

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('course_form_fields').update({ sort_order: neighbor.sort_order }).eq('id', field.id),
    supabase.from('course_form_fields').update({ sort_order: field.sort_order }).eq('id', neighbor.id),
  ]);
  if (e1 || e2) return { error: (e1 || e2).message };
  return { success: true };
}
