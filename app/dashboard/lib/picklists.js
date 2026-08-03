// טוען ערכי רשימת בחירה דינמית (picklists, מיגרציה 0034) - workspaceId null
// מביא רשימה גלובלית (כמו סיבות סגירה), אחרת רשימה ספציפית למחלקה.
export async function getPicklistValues(supabase, listKey, workspaceId) {
  let q = supabase.from('picklists').select('id, value, sort_order').eq('list_key', listKey).order('sort_order');
  q = workspaceId ? q.eq('workspace_id', workspaceId) : q.is('workspace_id', null);
  const { data } = await q;
  return data || [];
}
