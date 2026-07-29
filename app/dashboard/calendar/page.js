import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { addMeeting } from './actions';
import { addTask } from '../tasks/actions';
import CalendarBoard from './CalendarBoard';

// יומן משולב - פגישות ומשימות יחד, בתצוגת חודש/שבוע/יום, עם אפשרות
// לקבוע פגישה או משימה חדשה ישירות מתוך היומן (ר' CalendarBoard.js
// ללוגיקת התצוגה/הניווט, ו-EventModal.js ליצירה)
export default async function CalendarPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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
        .select('id, title, meeting_date, meeting_time, type, location, notes, contacts(id, first, last, phone, email)')
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

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>יומן</h1>

      <CalendarBoard
        meetings={meetings}
        tasks={tasks}
        contacts={contacts}
        members={members}
        currentUserId={user.id}
        addMeetingAction={addMeeting}
        addTaskAction={addTask}
      />
    </div>
  );
}
