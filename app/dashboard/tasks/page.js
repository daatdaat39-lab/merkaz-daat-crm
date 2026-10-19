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
  let members = [];
  if (workspaceId) {
    const [{ data: t }, { data: c }, { data: workspaceMembers }] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, due_date, due_time, remind_minutes_before, done, assigned_to, created_by, contacts(id, first, last)')
        .eq('workspace_id', workspaceId)
        .order('done', { ascending: true })
        .order('due_date', { ascending: true }),
      supabase.from('contacts').select('id, first, last').order('first'),
      supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
    ]);
    contacts = c || [];

    // אין קשר-מפתח (FK) בין workspace_members ל-profiles במסד, אז שולפים
    // בשתי שאילתות ומצרפים ידנית (כמו בעמוד הלידים)
    const memberIds = (workspaceMembers || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    members = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));
    const nameById = Object.fromEntries(members.map((m) => [m.id, m.name]));

    tasks = (t || []).map((task) => ({
      ...task,
      assignedName: nameById[task.assigned_to] || null,
      createdName: nameById[task.created_by] || null,
    }));
  }

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const overdueCount = openTasks.filter((t) => {
    if (!t.due_date) return false;
    return new Date(`${t.due_date}T${t.due_time || '23:59'}`).getTime() < Date.now();
  }).length;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px', background: 'var(--k-bg)', minHeight: '100%' }}>
      <h1 style={{ fontFamily: 'var(--k-font-display)', margin: '0 0 20px', fontSize: 30, color: 'var(--k-text)' }}>משימות</h1>

      <form action={addTask} style={{
        display: 'flex', gap: 8, marginBottom: 24, background: 'var(--k-surface)', border: '1px solid var(--k-border)',
        borderRadius: 14, padding: 14, flexWrap: 'wrap',
      }}>
        <input name="title" placeholder="משימה חדשה..." required style={{
          flex: 1, minWidth: 180, border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 12px', fontSize: 13, background: 'var(--k-bg)', color: 'var(--k-text)',
        }} />
        <select name="contact_id" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 12px', fontSize: 13, background: 'var(--k-bg)', color: 'var(--k-text)' }}>
          <option value="">ללא איש קשר</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.first} {c.last}</option>
          ))}
        </select>
        <select name="assigned_to" defaultValue={user.id} style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 12px', fontSize: 13, background: 'var(--k-bg)', color: 'var(--k-text)' }}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.id === user.id ? `${m.name} (אני)` : m.name}</option>
          ))}
        </select>
        <input type="date" name="due_date" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 12px', fontSize: 13, background: 'var(--k-bg)', color: 'var(--k-text)' }} />
        <input type="time" name="due_time" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 12px', fontSize: 13, background: 'var(--k-bg)', color: 'var(--k-text)' }} />
        <select name="remind_minutes_before" defaultValue="" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 12px', fontSize: 13, background: 'var(--k-bg)', color: 'var(--k-text)' }}>
          <option value="">ללא תזכורת</option>
          <option value="15">15 דקות לפני</option>
          <option value="30">30 דקות לפני</option>
          <option value="60">שעה לפני</option>
          <option value="1440">יום לפני</option>
        </select>
        <button type="submit" style={{
          background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 13, cursor: 'pointer',
        }}>
          הוספה
        </button>
      </form>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
        פתוחות ({openTasks.length}){overdueCount > 0 && <span style={{ color: 'var(--k-danger-text)' }}> · ⚠ {overdueCount} עברו את המועד</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {openTasks.map((t) => <TaskRow key={t.id} t={t} contacts={contacts} members={members} currentUserId={user.id} />)}
        {openTasks.length === 0 && <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>אין משימות פתוחות 🎉</div>}
      </div>

      {doneTasks.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            הושלמו ({doneTasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doneTasks.map((t) => <TaskRow key={t.id} t={t} contacts={contacts} members={members} currentUserId={user.id} />)}
          </div>
        </>
      )}
    </div>
  );
}
