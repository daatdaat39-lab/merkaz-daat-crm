'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';

async function requireWorkspace() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('current_workspace_id').eq('id', user.id).single();
  return { supabase, user, workspaceId: profile?.current_workspace_id || null };
}

export async function toggleTask(formData) {
  const { supabase } = await requireWorkspace();
  const taskId = formData.get('task_id');
  const done = formData.get('done') === 'true';
  await supabase.from('tasks').update({ done }).eq('id', taskId);
  redirect('/dashboard/tasks');
}

export async function addTask(formData) {
  const { supabase, user, workspaceId } = await requireWorkspace();
  if (!workspaceId) return;

  const title = formData.get('title');
  if (!title) return;

  await supabase.from('tasks').insert({
    workspace_id: workspaceId,
    title,
    due_date: formData.get('due_date') || null,
    due_time: formData.get('due_time') || null,
    remind_minutes_before: formData.get('remind_minutes_before') || null,
    contact_id: formData.get('contact_id') || null,
    assigned_to: user.id,
  });
  redirect('/dashboard/tasks');
}

export async function updateTask(taskId, formData) {
  const { supabase } = await requireWorkspace();

  const update = {
    title: formData.get('title'),
    due_date: formData.get('due_date') || null,
    due_time: formData.get('due_time') || null,
    remind_minutes_before: formData.get('remind_minutes_before') || null,
    contact_id: formData.get('contact_id') || null,
  };
  if (!update.title) return { error: 'יש להזין כותרת' };

  const { error } = await supabase.from('tasks').update(update).eq('id', taskId);
  if (error) return { error: error.message };

  redirect('/dashboard/tasks');
}
