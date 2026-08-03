'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';

async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) return { error: 'רק owner/admin יכול לערוך רשימות בחירה' };
  return { supabase };
}

export async function addPicklistValue(listKey, workspaceId, value) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { supabase } = ctx;
  const v = (value || '').trim();
  if (!v) return { error: 'יש להזין ערך' };

  let countQuery = supabase.from('picklists').select('id', { count: 'exact', head: true }).eq('list_key', listKey);
  countQuery = workspaceId ? countQuery.eq('workspace_id', workspaceId) : countQuery.is('workspace_id', null);
  const { count } = await countQuery;

  const { error } = await supabase.from('picklists').insert({
    list_key: listKey, workspace_id: workspaceId || null, value: v, sort_order: count || 0,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function removePicklistValue(id) {
  const ctx = await requireManager();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from('picklists').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
