'use server';

// פעולות שרת למסך "ניהול נתונים מרכזי" (Data Grid) - טבלת עריכה מהירה
// לכל אנשי הקשר של מחלקה אחת. כל פעולת כתיבה כאן דורשת owner/admin של
// אותה מחלקה בדיוק - עטיפות סביב פעולות קיימות (updateDepartmentExtraField,
// updateLeadStage) שלא נוגעות בהרשאה המקורית שלהן (עדיין פתוחות לכל
// נציג מוקצה במסכים אחרים, כמו עמוד לידים).
import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace, requireNotFrozen } from '../../lib/contactGuards';
import { getExtraFields } from '../../lib/extraFields';
import { getPipeline } from '../../lib/pipelines';
import { updateDepartmentExtraField, updateLeadStage } from '../../contacts/actions';

const GRID_BASE_FIELDS = [
  { key: 'first', label: 'שם פרטי', type: 'text' },
  { key: 'last', label: 'שם משפחה', type: 'text' },
  { key: 'phone', label: 'טלפון', type: 'text' },
  { key: 'phone2', label: 'טלפון נוסף', type: 'text' },
  { key: 'email', label: 'מייל', type: 'text' },
  { key: 'email2', label: 'מייל נוסף', type: 'text' },
  { key: 'idnum', label: 'ת"ז', type: 'text' },
  { key: 'birth_date', label: 'תאריך לידה', type: 'date' },
  { key: 'gender', label: 'מגדר', type: 'text' },
];
const GRID_BASE_FIELD_KEYS = new Set(GRID_BASE_FIELDS.map((f) => f.key));

async function requireGridManager(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!workspaceId) return { error: 'לא נבחרה מחלקה' };
  const allowed = await isManagerOfWorkspace(supabase, user.id, workspaceId);
  if (!allowed) return { error: 'רק בעלים/מנהל של המחלקה יכול לערוך במסך זה' };
  return { supabase, user };
}

// PostgREST reserved chars for .or() filter values: , . ( ) : - בלי
// escaping, מייל בחיפוש (שתמיד מכיל נקודה) היה שובר את התחביר. אותו
// עיקרון-זהירות שכבר קיים בקוד (contacts/actions.js, leadIntakeCore.js
// נמנעים במפורש מ-.or() גולמי לא-מסונן).
function escapeOrValue(v) {
  return /[,.():]/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v;
}

// שולף שורות (איש קשר + שיוך למחלקה) לגריד, יחד עם מטא-דאטה של עמודות
// (שדות נוספים + שלבי pipeline) לאותה מחלקה. מצב עימוד ({page,pageSize})
// לעומת "טען הכל" ({all:true}) - אותה שאילתה בדיוק, עם/בלי .range().
// opts תומך גם בפילטרים אופציונליים: search/stage/tags/extraFieldFilters/
// sortBy/sortDir - כולם כשאילתת-שרת אמיתית (לא fetch-then-filter בצד
// לקוח, שהיה שובר את העימוד). contacts:contact_id!inner נדרש רק כש
// יש פילטר/מיון בפועל על עמודה מוטמעת (חיפוש/תגיות/שם) - בלי פילטר,
// נשאר ה-left-join הרגיל, בלי שינוי התנהגות ברירת המחדל (אומת מול
// תיעוד @supabase/postgrest-js המותקן בפועל - "!inner" קובע רק את
// סוג ה-join, לא את צורת התשובה).
export async function fetchGridRows(workspaceId, opts = {}) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data: workspace } = await supabase.from('workspaces').select('id, name').eq('id', workspaceId).single();
  if (!workspace) return { error: 'המחלקה לא נמצאה' };

  // נטען לפני בניית ה-query כדי לוודא ש-extraFieldFilters מכיל רק
  // מפתחות אמיתיים מסוג לא-computed (ערך של שדה מחושב לעולם לא נשמר
  // ב-extra_fields בפועל - ר' computedFields.js - סינון/מיון לפיו
  // חסר-משמעות, לא רק לא-נתמך).
  const extraFields = await getExtraFields(supabase, workspace.name);
  const validExtraKeys = new Set(extraFields.filter((f) => f.type !== 'computed').map((f) => f.key));

  const search = (opts.search || '').toString().trim();
  const tags = Array.isArray(opts.tags) ? opts.tags.filter(Boolean) : [];
  const needsContactsEmbed = Boolean(search) || tags.length > 0 || opts.sortBy === 'first' || opts.sortBy === 'last';
  const contactsSelect = needsContactsEmbed
    ? 'contacts:contact_id!inner (id, first, last, phone, phone2, email, email2, idnum, birth_date, gender, frozen, tags)'
    : 'contacts:contact_id (id, first, last, phone, phone2, email, email2, idnum, birth_date, gender, frozen)';

  let query = supabase
    .from('contact_departments')
    .select(`id, stage, closed_reason, extra_fields, ${contactsSelect}`, { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (search) {
    const pattern = escapeOrValue(`%${search}%`);
    query = query.or(
      `first.ilike.${pattern},last.ilike.${pattern},phone.ilike.${pattern},phone2.ilike.${pattern},email.ilike.${pattern},email2.ilike.${pattern},idnum.ilike.${pattern}`,
      { referencedTable: 'contacts' }
    );
  }
  if (opts.stage) query = query.eq('stage', opts.stage);
  if (tags.length > 0) query = query.overlaps('contacts.tags', tags);
  if (opts.extraFieldFilters) {
    for (const [key, value] of Object.entries(opts.extraFieldFilters)) {
      if (!value || !validExtraKeys.has(key)) continue;
      const fieldDef = extraFields.find((f) => f.key === key);
      const path = `extra_fields->>${key}`;
      query = fieldDef?.type === 'select' ? query.eq(path, value) : query.ilike(path, `%${value}%`);
    }
  }

  if (opts.sortBy === 'first' || opts.sortBy === 'last') {
    query = query.order(opts.sortBy, { referencedTable: 'contacts', ascending: opts.sortDir === 'asc' });
  }
  query = query.order('created_at', { ascending: opts.sortBy ? opts.sortDir === 'asc' : false });

  if (!opts.all) {
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Number(opts.pageSize) || 100;
    query = query.range((page - 1) * pageSize, page * pageSize - 1);
  }

  const { data: rows, count, error } = await query;
  if (error) return { error: error.message };

  const pipeline = await getPipeline(supabase, workspace.name);

  const gridRows = (rows || [])
    .filter((r) => r.contacts)
    .map((r) => ({
      departmentRowId: r.id,
      contactId: r.contacts.id,
      stage: r.stage,
      closedReason: r.closed_reason,
      frozen: r.contacts.frozen,
      base: Object.fromEntries(GRID_BASE_FIELDS.map((f) => [f.key, r.contacts[f.key]])),
      extra: r.extra_fields || {},
    }));

  return {
    rows: gridRows,
    totalCount: count || 0,
    baseFields: GRID_BASE_FIELDS,
    extraFields,
    pipeline: { order: pipeline.order, sideStages: pipeline.sideStages, labels: pipeline.labels, colors: pipeline.colors },
  };
}

// תגיות ייחודיות של אנשי הקשר במחלקה הזו - לתפריט סינון-התגיות ב-
// DataGridClient.js. שאילתה נפרדת (לא חלק מ-fetchGridRows) כי נקראת
// רק כש-workspaceId משתנה, לא בכל שינוי פילטר/עמוד. בלי !inner - כאן
// רק קוראים, לא מסננים לפי זה.
export async function fetchGridDistinctTags(workspaceId) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from('contact_departments')
    .select('contacts:contact_id (tags)')
    .eq('workspace_id', workspaceId);
  if (error) return { error: error.message };

  const set = new Set();
  (data || []).forEach((r) => (r.contacts?.tags || []).forEach((t) => set.add(t)));
  return { tags: Array.from(set).sort() };
}

export async function updateGridBaseField(contactId, workspaceId, field, value) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  if (!GRID_BASE_FIELD_KEYS.has(field)) return { error: 'שדה לא תקין' };

  const frozenError = await requireNotFrozen(supabase, contactId);
  if (frozenError) return frozenError;

  const { error } = await supabase.from('contacts').update({ [field]: value || null }).eq('id', contactId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateGridExtraField(departmentRowId, workspaceId, key, value) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  return updateDepartmentExtraField(departmentRowId, key, value);
}

export async function updateGridStage(departmentRowId, workspaceId, stage, closedReason) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  return updateLeadStage(departmentRowId, stage, closedReason);
}

// כל מזהי אנשי הקשר במחלקה (בלי עימוד) - משמש את "בחירת הכל" בייצוא,
// כדי שהבחירה תכלול את כל השורות המתאימות בכל העמודים, לא רק את מה
// שכבר נטען בעמוד הנוכחי.
export async function fetchAllContactIds(workspaceId) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from('contact_departments')
    .select('contact_id')
    .eq('workspace_id', workspaceId);
  if (error) return { error: error.message };
  return { contactIds: (data || []).map((r) => r.contact_id) };
}

// ייצוא מלא לאנשי קשר נבחרים - לא רק שדות הגריד (בסיס+נוספים) אלא גם
// היסטוריית תרומות (donation_transactions) והתחייבויות (commitments),
// שהן טבלאות אחד-לרבים ולכן לא חלק מהשורה השטוחה של הגריד. מוחזר גולמי -
// בניית ה-CSV בפועל קורית בלקוח (עקבי עם ImportExportButtons.js).
export async function exportGridContacts(workspaceId, contactIds) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  if (!Array.isArray(contactIds) || contactIds.length === 0) return { error: 'לא נבחרו אנשי קשר' };

  const { data: workspace } = await supabase.from('workspaces').select('id, name').eq('id', workspaceId).single();
  if (!workspace) return { error: 'המחלקה לא נמצאה' };

  const [{ data: contacts }, { data: memberships }, { data: transactions }, { data: commitments }] = await Promise.all([
    supabase.from('contacts').select('*').in('id', contactIds),
    supabase.from('contact_departments').select('contact_id, stage, extra_fields').eq('workspace_id', workspaceId).in('contact_id', contactIds),
    supabase.from('donation_transactions')
      .select('contact_id, source_system, amount, transaction_date, designation, payment_method, transaction_type, campaign_reference, fundraiser_name, external_doc_number, receipt_url')
      .eq('workspace_id', workspaceId).in('contact_id', contactIds),
    supabase.from('commitments')
      .select('contact_id, total_amount, installments_count, status, note, created_at, start_date, end_date, frequency, bounced_count, external_reference, designation, payment_method, last_payment_status, source_channel')
      .eq('workspace_id', workspaceId).in('contact_id', contactIds),
  ]);

  const extraFields = await getExtraFields(supabase, workspace.name);

  return {
    contacts: contacts || [],
    memberships: memberships || [],
    extraFields,
    transactions: transactions || [],
    commitments: commitments || [],
  };
}
