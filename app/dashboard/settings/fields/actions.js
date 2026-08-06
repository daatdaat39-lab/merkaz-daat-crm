'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace, isManagerOfWorkspace } from '../../lib/contactGuards';
import { COMPUTED_FORMULAS } from '../../lib/computedFields';
import { parseFormula, collectFieldRefs } from '../../lib/safeExpression';

async function requireManager(workspaceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = workspaceId
    ? await isManagerOfWorkspace(supabase, user.id, workspaceId)
    : await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin של המחלקה יכול לערוך שדות' };
  return { supabase };
}

// field_key לא ניתן לעריכה אחרי יצירה (immutable) - contact_departments.
// extra_fields הוא jsonb חופשי, אז שינוי מפתח קיים יתמך נתונים קיימים.
export async function createField(workspaceId, { fieldKey, label, type, options, visibleToAgents }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const key = (fieldKey || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const lbl = (label || '').trim();
  if (!key || !lbl) return { error: 'יש להזין מפתח טכני ותווית' };

  let storedOptions = [];
  if (type === 'select') {
    storedOptions = options || [];
  } else if (type === 'computed') {
    // שדה מחושב לעולם לא נערך ידנית - ה-options שלו הוא תצורת החישוב
    // (איזו נוסחה + אילו שדות אחרים), לא רשימת ערכים. מוודאים שהנוסחה
    // מוכרת (whitelist ב-computedFields.js) ושהשדות שהיא מצביעה עליהם
    // קיימים בפועל באותה מחלקה, מהסוג הנכון - כדי שלא ייווצר שדה
    // מחושב "שבור" שמצביע לשום מקום.
    const formula = COMPUTED_FORMULAS.find((f) => f.value === options?.formula);
    if (!formula) return { error: 'נוסחת חישוב לא תקינה' };
    const { data: existingFields } = await supabase.from('workspace_extra_fields')
      .select('field_key, type').eq('workspace_id', workspaceId);

    if (options.formula === 'remaining_months_from_date_plus_years') {
      const dateField = (existingFields || []).find((f) => f.field_key === options.dateField && f.type === 'date');
      const durationField = (existingFields || []).find((f) => f.field_key === options.durationField && f.type === 'number');
      if (!dateField) return { error: 'יש לבחור שדה תאריך קיים מהמחלקה' };
      if (!durationField) return { error: 'יש לבחור שדה משך (מספר) קיים מהמחלקה' };
      storedOptions = { formula: options.formula, dateField: options.dateField, durationField: options.durationField };
    } else if (options.formula === 'expression') {
      // נוסחה חופשית (בעיקר מוצעת ע"י אשף ה-AI) - מאומתת דרך פארסר בטוח
      // (safeExpression.js, בלי eval) לפני שהיא נשמרת בכלל.
      let ast;
      try {
        ast = parseFormula(options.expression);
      } catch {
        return { error: 'הנוסחה לא תקינה תחבירית' };
      }
      const existingKeys = new Set((existingFields || []).map((f) => f.field_key));
      const refs = Array.from(collectFieldRefs(ast));
      const unknownRefs = refs.filter((r) => r !== 'today' && !existingKeys.has(r));
      if (unknownRefs.length > 0) return { error: `הנוסחה מפנה לשדה לא קיים: ${unknownRefs[0]}` };
      storedOptions = { formula: 'expression', expression: options.expression, unit: options.unit || null };
    } else {
      return { error: 'נוסחת חישוב לא תקינה' };
    }
  }

  const { count } = await supabase.from('workspace_extra_fields')
    .select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);

  const { error } = await supabase.from('workspace_extra_fields').insert({
    workspace_id: workspaceId,
    field_key: key,
    label: lbl,
    type: type || 'text',
    options: storedOptions,
    sort_order: count || 0,
    visible_to_agents: visibleToAgents !== false,
  });
  if (error) return { error: error.code === '23505' ? 'מפתח זה כבר קיים במחלקה זו' : error.message };
  return { success: true };
}

export async function updateField(id, workspaceId, { label, options, visibleToAgents }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const lbl = (label || '').trim();
  if (!lbl) return { error: 'יש להזין תווית' };

  const patch = { label: lbl, options: options || [] };
  if (typeof visibleToAgents === 'boolean') patch.visible_to_agents = visibleToAgents;

  const { error } = await ctx.supabase.from('workspace_extra_fields').update(patch).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function reorderFields(workspaceId, orderedIds) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from('workspace_extra_fields').update({ sort_order: i }).eq('id', orderedIds[i]);
  }
  return { success: true };
}

// חוסם מחיקה אם יש אנשי קשר בפועל עם ערך למפתח הזה (extra_fields הוא
// jsonb חופשי, ר' ? operator - "המפתח קיים באובייקט")
export async function deleteField(id, workspaceId, fieldKey) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  // בדיקת jsonb ? key לא זמינה דרך ה-filter הגנרי של supabase-js בלי RPC -
  // שולפים את שורות ה-workspace ובודקים בצד שרת
  const { data: rows } = await supabase.from('contact_departments').select('extra_fields').eq('workspace_id', workspaceId);
  const inUseCount = (rows || []).filter((r) => r.extra_fields && Object.prototype.hasOwnProperty.call(r.extra_fields, fieldKey)).length;
  if (inUseCount > 0) return { error: `לא ניתן למחוק - ${inUseCount} אנשי קשר יש להם ערך בשדה הזה` };

  const { error } = await supabase.from('workspace_extra_fields').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
