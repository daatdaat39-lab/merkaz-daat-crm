// עזרים משותפים להרשאות/הקפאה של אנשי קשר - קובץ רגיל (לא 'use server')
// כדי שיהיה ניתן לייבא גם מ-contacts/actions.js וגם מ-tasks/actions.js.

// true אם המשתמש הוא owner/admin באחת המחלקות שאיש הקשר משויך אליהן היום
export async function isManagerOfAnyDepartment(supabase, userId, contactId) {
  const { data: depts } = await supabase
    .from('contact_departments')
    .select('workspace_id')
    .eq('contact_id', contactId);
  const workspaceIds = (depts || []).map((d) => d.workspace_id);
  if (workspaceIds.length === 0) return false;

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', userId)
    .in('workspace_id', workspaceIds)
    .in('role', ['owner', 'admin']);

  return (memberships?.length || 0) > 0;
}

// מחזיר { error } אם איש הקשר מוקפא, אחרת null - יש לקרוא בתחילת כל
// פעולה שמשנה משהו אצל איש קשר (עריכה/שלב/משימות/הערות/שיוך למחלקה)
export async function requireNotFrozen(supabase, contactId) {
  const { data: contact } = await supabase.from('contacts').select('frozen').eq('id', contactId).single();
  if (contact?.frozen) return { error: 'איש הקשר מוקפא - לא ניתן לבצע שינויים עד להפשרה' };
  return null;
}
