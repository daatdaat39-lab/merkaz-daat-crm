import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { addTask } from './actions';
import TaskRow from './TaskRow';

export default async function TasksPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let tasks = [];
  let contacts = [];
  if (workspaceId) {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, due_date, due_time, remind_minutes_before, done, contacts(id, first, last)')
        .eq('workspace_id', workspaceId)
        .order('done', { ascending: true })
        .order('due_date', { ascending: true }),
      supabase.from('contacts').select('id, first, last').eq('workspace_id', workspaceId).order('first'),
    ]);
    tasks = t || [];
    contacts = c || [];
  }

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const overdueCount = openTasks.filter((t) => {
    if (!t.due_date) return false;
    return new Date(`${t.due_date}T${t.due_time || '23:59'}`).getTime() < Date.now();
  }).length;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>משימות</h1>

      <form action={addTask} style={{
        display: 'flex', gap: 8, marginBottom: 24, background: '#fff', border: '1px solid #e5e5e5',
        borderRadius: 8, padding: 14, flexWrap: 'wrap',
      }}>
        <input name="title" placeholder="משימה חדשה..." required style={{
          flex: 1, minWidth: 180, border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13,
        }} />
        <select name="contact_id" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}>
          <option value="">ללא איש קשר</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.first} {c.last}</option>
          ))}
        </select>
        <input type="date" name="due_date" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
        <input type="time" name="due_time" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
        <select name="remind_minutes_before" defaultValue="" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}>
          <option value="">ללא תזכורת</option>
          <option value="15">15 דקות לפני</option>
          <option value="30">30 דקות לפני</option>
          <option value="60">שעה לפני</option>
          <option value="1440">יום לפני</option>
        </select>
        <button type="submit" style={{
          background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
        }}>
          הוספה
        </button>
      </form>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        פתוחות ({openTasks.length}){overdueCount > 0 && <span style={{ color: 'var(--danger, #a3392f)' }}> · ⚠ {overdueCount} עברו את המועד</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {openTasks.map((t) => <TaskRow key={t.id} t={t} contacts={contacts} />)}
        {openTasks.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין משימות פתוחות 🎉</div>}
      </div>

      {doneTasks.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
            הושלמו ({doneTasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doneTasks.map((t) => <TaskRow key={t.id} t={t} contacts={contacts} />)}
          </div>
        </>
      )}
    </div>
  );
}
