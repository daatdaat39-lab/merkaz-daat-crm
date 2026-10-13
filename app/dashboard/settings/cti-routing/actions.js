'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';

async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin יכול לערוך ניתוב-קווים' };
  return { supabase };
}

export async function addLineRouting({ dnumber, workspaceId, label }) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  if (!dnumber?.trim() || !workspaceId) return { error: 'יש למלא מספר-קו ומחלקה' };
  const { error } = await ctx.supabase.from('cti_line_routing').insert({
    dnumber: dnumber.trim(), workspace_id: workspaceId, label: (label || '').trim() || null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeLineRouting(id) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('cti_line_routing').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
