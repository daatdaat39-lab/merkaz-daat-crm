'use client';

import { useCallback, useEffect, useState } from 'react';
import { addMeetingNoRedirect } from './actions';
import { addTask } from '../tasks/actions';
import CalendarBoard from './CalendarBoard';

// תוכן היומן בתוך חלון צף - נטען בצד הלקוח דרך /api/calendar-data (אותו
// דפוס בדיוק כמו FloatingContactCard.js + api/contact-card/[id]), כי
// חלון צף לא חלק מעץ ה-server components של הדף שבו הוא נפתח.
// addMeetingAction עוטף את addMeetingNoRedirect (לא addMeeting הרגילה -
// ר' actions.js להסבר) ומרענן את הנתונים המקומיים בהצלחה, כי אין כאן
// router.refresh() שיביא מחדש props מהשרת כמו בדף היומן המלא.
export default function FloatingCalendar({ initialContactId, autoOpenToday }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch('/api/calendar-data')
      .then(async (res) => {
        if (!res.ok) { setError('שגיאה בטעינת היומן'); return; }
        const json = await res.json();
        setData(json);
      })
      .catch((err) => setError('שגיאה בטעינה: ' + (err?.message || String(err))));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddMeeting = useCallback(async (formData) => {
    const res = await addMeetingNoRedirect(formData);
    if (!res?.error) load();
    return res;
  }, [load]);

  const handleAddTask = useCallback(async (formData) => {
    const res = await addTask(formData);
    if (!res?.error) load();
    return res;
  }, [load]);

  if (error) return <div style={{ fontSize: 13, color: 'var(--danger, #a3392f)' }}>{error}</div>;
  if (!data) return <div style={{ fontSize: 13, color: '#9b9b9b' }}>טוען...</div>;

  return (
    <CalendarBoard
      meetings={data.meetings}
      tasks={data.tasks}
      contacts={data.contacts}
      members={data.members}
      currentUserId={data.currentUserId}
      addMeetingAction={handleAddMeeting}
      addTaskAction={handleAddTask}
      initialContactId={initialContactId}
      autoOpenToday={autoOpenToday}
    />
  );
}
