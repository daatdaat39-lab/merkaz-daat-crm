import { createClient } from '../../../lib/supabase/server';

// לוגיקת טעינת נתוני היומן, משותפת בין הדף המלא (calendar/page.js,
// server component) לבין נקודת הקצה /api/calendar-data (נקראת client-side
// מ-FloatingCalendar.js, אותו דפוס בדיוק כמו loadContactCardData.js
// שמשותף בין דף איש קשר לבין /api/contact-card/[id]).
export async function loadCalendarData() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirectToLogin: true };

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let meetings = [];
  let tasks = [];
  let contacts = [];
  let members = [];
  if (workspaceId) {
    const [{ data: m }, { data: t }, { data: c }, { data: workspaceMembers }] = await Promise.all([
      supabase
        .from('meetings')
        .select('id, title, meeting_date, meeting_time, type, location, notes, zoom_join_url, contacts(id, first, last, phone, email)')
        .eq('workspace_id', workspaceId)
        .order('meeting_date', { ascending: true })
        .order('meeting_time', { ascending: true }),
      supabase
        .from('tasks')
        .select('id, title, description, due_date, due_time, remind_minutes_before, done, assigned_to, created_by, contacts(id, first, last)')
        .eq('workspace_id', workspaceId)
        .order('due_date', { ascending: true }),
      supabase.from('contacts').select('id, first, last').order('first'),
      supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
    ]);
    meetings = m || [];
    contacts = c || [];

    // אין קשר-מפתח (FK) בין workspace_members ל-profiles במסד, אז שולפים
    // בשתי שאילתות ומצרפים ידנית (כמו בעמוד המשימות/לידים)
    const memberIds = (workspaceMembers || []).map((mm) => mm.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    members = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));
    const nameById = Object.fromEntries(members.map((mm) => [mm.id, mm.name]));

    tasks = (t || []).map((task) => ({
      ...task,
      assignedName: nameById[task.assigned_to] || null,
      createdName: nameById[task.created_by] || null,
    }));
  }

  return { props: { meetings, tasks, contacts, members, currentUserId: user.id } };
}
