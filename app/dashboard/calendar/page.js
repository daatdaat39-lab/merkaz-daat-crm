import { redirect } from 'next/navigation';
import { addMeeting } from './actions';
import { addTask } from '../tasks/actions';
import { loadCalendarData } from './loadCalendarData';
import CalendarBoard from './CalendarBoard';

// יומן משולב - פגישות ומשימות יחד, בתצוגת חודש/שבוע/יום, עם אפשרות
// לקבוע פגישה או משימה חדשה ישירות מתוך היומן (ר' CalendarBoard.js
// ללוגיקת התצוגה/הניווט, ו-EventModal.js ליצירה). טעינת הנתונים משותפת
// עם /api/calendar-data (ר' loadCalendarData.js) לשימוש בחלון צף.
export default async function CalendarPage() {
  const data = await loadCalendarData();
  if (data.redirectToLogin) redirect('/login');
  const { meetings, tasks, contacts, members, currentUserId } = data.props;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>יומן</h1>

      <CalendarBoard
        meetings={meetings}
        tasks={tasks}
        contacts={contacts}
        members={members}
        currentUserId={currentUserId}
        addMeetingAction={addMeeting}
        addTaskAction={addTask}
      />
    </div>
  );
}
