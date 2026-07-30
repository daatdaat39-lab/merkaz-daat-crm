'use server';

import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function sendChatMessage(workspaceId, body) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const text = (body || '').trim();
  if (!text) return { error: 'הודעה ריקה' };
  if (!workspaceId) return { error: 'לא נבחרה מחלקה' };

  const { error } = await supabase.from('chat_messages').insert({
    workspace_id: workspaceId,
    sender_id: user.id,
    body: text,
  });
  if (error) return { error: error.message };

  revalidatePath('/dashboard/chat');
  return { success: true };
}
