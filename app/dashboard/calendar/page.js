import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { addMeeting } from './actions';
import MeetingRow from './MeetingRow';

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
  let contacts = [];
  if (workspaceId) {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase
        .from('meetings')
        .select('id, title, meeting_date, meeting_time, type, location, notes, contacts(id, first, last, phone, email)')
        .eq('workspace_id', workspaceId)
        .order('meeting_date', { ascending: true })
        .order('meeting_time', { ascending: true }),
      supabase.from('contacts').select('id, first, last').order('first'),
    ]);
    meetings = m || [];
    contacts = c || [];
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = meetings.filter((m) => m.meeting_date >= today);
  const past = meetings.filter((m) => m.meeting_date < today);

  const grouped = upcoming.reduce((acc, m) => {
    acc[m.meeting_date] = acc[m.meeting_date] || [];
    acc[m.meeting_date].push(m);
    return acc;
  }, {});

  const next = upcoming[0];
  const minutesUntilNext = next ? (new Date(`${next.meeting_date}T${next.meeting_time || '00:00'}`).getTime() - Date.now()) / 60000 : null;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>יומן פגישות</h1>

      <form action={addMeeting} style={{
        display: 'flex', gap: 8, marginBottom: 24, background: '#fff', border: '1px solid #e5e5e5',
        borderRadius: 8, padding: 14, flexWrap: 'wrap',
      }}>
        <select name="contact_id" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 140 }}>
          <option value="">בחר איש קשר...</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.first} {c.last}</option>
          ))}
        </select>
        <input type="date" name="meeting_date" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
        <input type="time" name="meeting_time" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
        <select name="type" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}>
          <option value="פרונטלי">פרונטלי</option>
          <option value="טלפוני">טלפוני</option>
          <option value="זום">זום</option>
        </select>
        <input name="location" placeholder="מיקום (אופציונלי)" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
        <button type="submit" style={{
          background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
        }}>
          קביעת פגישה
        </button>
      </form>

      {Object.keys(grouped).length === 0 && (
        <div style={{ fontSize: 13, color: '#9b9b9b', marginBottom: 20 }}>אין פגישות קרובות</div>
      )}

      {next && minutesUntilNext !== null && minutesUntilNext < 24 * 60 && minutesUntilNext > -30 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '16px 20px', borderRadius: 10,
          background: 'linear-gradient(90deg, #fff7ed, #fffaf0)', border: '1px solid #fde3b8',
        }}>
          <div style={{ fontSize: 26 }}>🔔</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#c2760f', textTransform: 'uppercase', letterSpacing: 0.3 }}>
              הפגישה הבאה שלך
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 2 }}>
              {next.contacts?.first} {next.contacts?.last}
              <span style={{ fontWeight: 400, color: '#8a5a1a', marginRight: 8 }}>
                {minutesUntilNext < 0
                  ? 'מתחילה עכשיו'
                  : minutesUntilNext < 60
                  ? `בעוד ${Math.round(minutesUntilNext)} דקות`
                  : minutesUntilNext < 24 * 60 && next.meeting_date === today
                  ? `היום ב-${next.meeting_time?.slice(0, 5)}`
                  : `מחר ב-${next.meeting_time?.slice(0, 5)}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([date, list]) => {
        const isToday = date === today;
        return (
          <div key={date} style={{ marginBottom: 18 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 8,
              color: isToday ? '#c2760f' : '#6b6b6b',
              background: isToday ? '#fff3dd' : 'transparent', padding: isToday ? '3px 10px' : 0, borderRadius: 999,
            }}>
              {isToday && '📅'}
              {isToday ? 'היום' : new Date(date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((m) => <MeetingRow key={m.id} m={m} />)}
            </div>
          </div>
        );
      })}

      {past.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ fontSize: 12, color: '#9b9b9b', cursor: 'pointer' }}>פגישות שעברו ({past.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {past.map((m) => <MeetingRow key={m.id} m={m} compact />)}
          </div>
        </details>
      )}
    </div>
  );
}
