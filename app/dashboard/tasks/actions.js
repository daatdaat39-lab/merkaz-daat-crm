'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireNotFrozen } from '../lib/contactGuards';

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

  const { data: task } = await supabase.from('tasks').select('contact_id').eq('id', taskId).single();
  if (task?.contact_id) {
    const frozenError = await requireNotFrozen(supabase, task.contact_id);
    if (frozenError) return frozenError;
  }

  const { error } = await supabase.from('tasks').update({ done }).eq('id', taskId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/tasks');
  return { success: true };
}

export async function addTask(formData) {
  const { supabase, user, workspaceId } = await requireWorkspace();
  if (!workspaceId) return { error: 'לא נמצא workspace פעיל' };

  const title = formData.get('title');
  if (!title) return { error: 'יש להזין כותרת' };

  const contactId = formData.get('contact_id') || null;
  if (contactId) {
    const frozenError = await requireNotFrozen(supabase, contactId);
    if (frozenError) return frozenError;
  }

  const { error } = await supabase.from('tasks').insert({
    workspace_id: workspaceId,
    title,
    due_date: formData.get('due_date') || null,
    due_time: formData.get('due_time') || null,
    remind_minutes_before: formData.get('remind_minutes_before') || null,
    contact_id: contactId,
    assigned_to: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath('/dashboard/tasks');
  return { success: true };
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

  // בודקים הקפאה גם על איש הקשר הישן (אם היה) וגם על החדש (אם השתנה)
  const { data: existingTask } = await supabase.from('tasks').select('contact_id').eq('id', taskId).single();
  for (const cid of new Set([existingTask?.contact_id, update.contact_id].filter(Boolean))) {
    const frozenError = await requireNotFrozen(supabase, cid);
    if (frozenError) return frozenError;
  }

  const { error } = await supabase.from('tasks').update(update).eq('id', taskId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/tasks');
  return { success: true };
}
