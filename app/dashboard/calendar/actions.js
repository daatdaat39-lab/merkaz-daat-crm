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

export async function addMeeting(formData) {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const contactId = formData.get('contact_id');
  const date = formData.get('meeting_date');
  const time = formData.get('meeting_time');
  const type = formData.get('type') || 'פרונטלי';
  if (!workspaceId || !contactId || !date || !time) return;

  await supabase.from('meetings').insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    meeting_date: date,
    meeting_time: time,
    type,
    location: formData.get('location') || null,
    agent_id: user.id,
  });
  redirect('/dashboard/calendar');
}

export async function updateMeeting(meetingId, formData) {
  const { supabase } = await requireWorkspace();

  const update = {
    meeting_date: formData.get('meeting_date'),
    meeting_time: formData.get('meeting_time'),
    type: formData.get('type') || 'פרונטלי',
    location: formData.get('location') || null,
    notes: formData.get('notes') || null,
  };
  if (!update.meeting_date || !update.meeting_time) return { error: 'יש להזין תאריך ושעה' };

  const { error } = await supabase.from('meetings').update(update).eq('id', meetingId);
  if (error) return { error: error.message };

  redirect('/dashboard/calendar');
}

export async function deleteMeeting(meetingId) {
  const { supabase } = await requireWorkspace();
  const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
  if (error) return { error: error.message };
  redirect('/dashboard/calendar');
}
