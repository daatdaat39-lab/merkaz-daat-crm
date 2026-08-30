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

// true אם המשתמש הוא owner/admin במחלקה הנתונה עצמה - בשונה מ-
// isManagerOfAnyDepartment למעלה, כאן אין contactId קונקרטי לבדוק מולו
// (למשל בייבוא בכמות שמיועד למחלקה כולה, לא לאיש קשר ספציפי)
export async function isManagerOfWorkspace(supabase, userId, workspaceId) {
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  return !!membership;
}

// true אם המשתמש חבר במחלקה הנתונה בכל תפקיד שהוא (owner/admin/agent) -
// בשונה מ-isManagerOfWorkspace, לא מסנן לפי תפקיד - שער-הרשאה לתכונות
// שכל נציג רגיל (לא רק מנהל) צריך לגשת אליהן, כמו תור-שיחות לטלמרקטינג.
export async function isMemberOfWorkspace(supabase, userId, workspaceId) {
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return !!membership;
}

// true אם המשתמש הוא owner/admin בכל מחלקה שהיא (לא מוגבל למחלקה אחת) -
// לכלים "מנהלתיים" שחוצים את כל המערכת, כמו תור בדיקת כפליות
export async function isManagerOfAnyWorkspace(supabase, userId) {
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .limit(1);
  return (memberships?.length || 0) > 0;
}
