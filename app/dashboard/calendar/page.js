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

      {Object.entries(grouped).map(([date, list]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b6b6b', marginBottom: 8 }}>
            {new Date(date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((m) => <MeetingRow key={m.id} m={m} />)}
          </div>
        </div>
      ))}

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
