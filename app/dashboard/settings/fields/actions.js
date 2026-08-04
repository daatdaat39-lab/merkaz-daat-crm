'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace, isManagerOfWorkspace } from '../../lib/contactGuards';

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
export async function createField(workspaceId, { fieldKey, label, type, options }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const key = (fieldKey || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const lbl = (label || '').trim();
  if (!key || !lbl) return { error: 'יש להזין מפתח טכני ותווית' };

  const { count } = await supabase.from('workspace_extra_fields')
    .select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);

  const { error } = await supabase.from('workspace_extra_fields').insert({
    workspace_id: workspaceId,
    field_key: key,
    label: lbl,
    type: type || 'text',
    options: type === 'select' ? (options || []) : [],
    sort_order: count || 0,
  });
  if (error) return { error: error.code === '23505' ? 'מפתח זה כבר קיים במחלקה זו' : error.message };
  return { success: true };
}

export async function updateField(id, workspaceId, { label, options }) {
  const ctx = await requireManager(workspaceId);
  if (ctx.error) return ctx;
  const lbl = (label || '').trim();
  if (!lbl) return { error: 'יש להזין תווית' };

  const { error } = await ctx.supabase.from('workspace_extra_fields').update({
    label: lbl, options: options || [],
  }).eq('id', id);
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
