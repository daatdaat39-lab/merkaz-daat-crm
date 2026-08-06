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

// שולף שורות (איש קשר + שיוך למחלקה) לגריד, יחד עם מטא-דאטה של עמודות
// (שדות נוספים + שלבי pipeline) לאותה מחלקה. מצב עימוד ({page,pageSize})
// לעומת "טען הכל" ({all:true}) - אותה שאילתה בדיוק, עם/בלי .range().
export async function fetchGridRows(workspaceId, opts = {}) {
  const ctx = await requireGridManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { data: workspace } = await supabase.from('workspaces').select('id, name').eq('id', workspaceId).single();
  if (!workspace) return { error: 'המחלקה לא נמצאה' };

  let query = supabase
    .from('contact_departments')
    .select('id, stage, closed_reason, extra_fields, contacts:contact_id (id, first, last, phone, phone2, email, email2, idnum, birth_date, gender, frozen)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (!opts.all) {
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Number(opts.pageSize) || 100;
    query = query.range((page - 1) * pageSize, page * pageSize - 1);
  }

  const { data: rows, count, error } = await query;
  if (error) return { error: error.message };

  const extraFields = await getExtraFields(supabase, workspace.name);
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
