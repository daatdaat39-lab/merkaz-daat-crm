import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

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
        .select('id, title, description, due_date, done, contacts(id, first, last)')
        .eq('workspace_id', workspaceId)
        .order('done', { ascending: true })
        .order('due_date', { ascending: true }),
      supabase.from('contacts').select('id, first, last').eq('workspace_id', workspaceId).order('first'),
    ]);
    tasks = t || [];
    contacts = c || [];
  }

  async function toggleTask(formData) {
    'use server';
    const supabase = createClient();
    const taskId = formData.get('task_id');
    const done = formData.get('done') === 'true';
    await supabase.from('tasks').update({ done }).eq('id', taskId);
    redirect('/dashboard/tasks');
  }

  async function addTask(formData) {
    'use server';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
    const workspaceId = profile?.current_workspace_id;
    if (!workspaceId) return;

    const title = formData.get('title');
    const dueDate = formData.get('due_date') || null;
    const contactId = formData.get('contact_id') || null;
    if (!title) return;

    await supabase.from('tasks').insert({
      workspace_id: workspaceId,
      title,
      due_date: dueDate,
      contact_id: contactId,
      assigned_to: user.id,
    });
    redirect('/dashboard/tasks');
  }

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

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
        <button type="submit" style={{
          background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
        }}>
          הוספה
        </button>
      </form>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        פתוחות ({openTasks.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {openTasks.map((t) => <TaskRow key={t.id} t={t} toggleTask={toggleTask} />)}
        {openTasks.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין משימות פתוחות 🎉</div>}
      </div>

      {doneTasks.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
            הושלמו ({doneTasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doneTasks.map((t) => <TaskRow key={t.id} t={t} toggleTask={toggleTask} />)}
          </div>
        </>
      )}
    </div>
  );
}

function TaskRow({ t, toggleTask }) {
  return (
    <form action={toggleTask} style={{
      display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e5e5e5',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <input type="hidden" name="task_id" value={t.id} />
      <input type="hidden" name="done" value={(!t.done).toString()} />
      <button type="submit" style={{
        width: 18, height: 18, borderRadius: 4, border: '1px solid #d0d0d0',
        background: t.done ? '#16a34a' : '#fff', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0,
      }}>
        {t.done ? '✓' : ''}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9b9b9b' : '#0a0a0a' }}>
          {t.title}
        </div>
        <div style={{ fontSize: 11, color: '#9b9b9b', display: 'flex', gap: 8 }}>
          {t.contacts && (
            <Link href={`/dashboard/contacts/${t.contacts.id}`} style={{ color: '#9b9b9b' }}>
              {t.contacts.first} {t.contacts.last}
            </Link>
          )}
          {t.due_date && <span>יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}</span>}
        </div>
      </div>
    </form>
  );
}
