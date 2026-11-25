'use server';

import { createClient } from '../../../lib/supabase/server';
import { isMemberOfWorkspace, isManagerOfWorkspace } from '../lib/contactGuards';
import { linkPhoneToContact } from '../../../lib/whatsapp/conversations';

// פעולות מסך השיחות (whatsapp_conversations, migration 0196). גישה לשיחה:
// חברי המחלקה שלה; שיחה בלי מחלקה (מספר לא מזוהה) פתוחה לכל משתמש מחובר.
async function requireConversation(conversationId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { data: conversation } = await supabase.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conversation) return { error: 'השיחה לא נמצאה' };
  if (conversation.workspace_id && !(await isMemberOfWorkspace(supabase, user.id, conversation.workspace_id))) {
    return { error: 'אין לך גישה לשיחה הזו' };
  }
  return { supabase, user, conversation };
}

// טוען את ההודעות של שיחה ומסמן אותה כנקראה - עבור המשתמש הזה בלבד
// (whatsapp_conversation_reads), לא עבור שאר הנציגים.
export async function openConversation(conversationId) {
  const ctx = await requireConversation(conversationId);
  if (ctx.error) return { error: ctx.error };
  const { supabase, user } = ctx;

  const { data: rows } = await supabase
    .from('sent_whatsapp')
    .select('id, direction, kind, message, reason, sent_at, sent_by, media_uid')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(300);
  const messages = (rows || []).reverse();

  const senderIds = Array.from(new Set(messages.map((m) => m.sent_by).filter(Boolean)));
  const { data: senders } = senderIds.length
    ? await supabase.from('profiles').select('id, name').in('id', senderIds)
    : { data: [] };
  const senderNames = Object.fromEntries((senders || []).map((p) => [p.id, p.name || 'נציג']));

  await supabase.from('whatsapp_conversation_reads').upsert(
    { user_id: user.id, conversation_id: conversationId, last_read_at: new Date().toISOString() },
    { onConflict: 'user_id,conversation_id' }
  );
  return { messages, senderNames };
}

// "אני מטפל" - לוקח שיחה שאין לה בעלים (או מעביר אליי שיחה מהתור).
export async function claimConversation(conversationId) {
  const ctx = await requireConversation(conversationId);
  if (ctx.error) return { error: ctx.error };
  const { error } = await ctx.supabase.from('whatsapp_conversations').update({ assigned_to: ctx.user.id }).eq('id', conversationId);
  return error ? { error: error.message } : { success: true };
}

// העברת שיחה לנציג אחר - מנהל המחלקה בלבד, והנציג חייב להיות חבר בה.
export async function assignConversation(conversationId, agentId) {
  const ctx = await requireConversation(conversationId);
  if (ctx.error) return { error: ctx.error };
  const { supabase, user, conversation } = ctx;
  if (!conversation.workspace_id) return { error: 'קודם יש לקשר את המספר לאיש קשר' };
  if (!(await isManagerOfWorkspace(supabase, user.id, conversation.workspace_id))) return { error: 'רק מנהל המחלקה יכול להעביר שיחה' };
  if (agentId && !(await isMemberOfWorkspace(supabase, agentId, conversation.workspace_id))) return { error: 'הנציג אינו חבר במחלקה' };
  const { error } = await supabase.from('whatsapp_conversations').update({ assigned_to: agentId || null }).eq('id', conversationId);
  return error ? { error: error.message } : { success: true };
}

// "טופל - לא דורש מענה": הדרך היחידה ששיחה יוצאת מ"ממתינים" בלי תשובה.
// נרשם מי ומתי; הודעה חדשה מהלקוח פותחת אותה מחדש.
export async function markConversationDone(conversationId) {
  const ctx = await requireConversation(conversationId);
  if (ctx.error) return { error: ctx.error };
  const { error } = await ctx.supabase.from('whatsapp_conversations').update({
    status: 'done', waiting_since: null, closed_by: ctx.user.id, closed_at: new Date().toISOString(),
  }).eq('id', conversationId);
  return error ? { error: error.message } : { success: true };
}

// קישור מספר לא מזוהה לאיש קשר קיים - כל ההודעות והשיחה עוברות אליו.
export async function linkConversationToContact(conversationId, contactId) {
  const ctx = await requireConversation(conversationId);
  if (ctx.error) return { error: ctx.error };
  const { supabase, conversation } = ctx;
  if (conversation.contact_id) return { error: 'השיחה כבר מקושרת לאיש קשר' };
  const { data: contact } = await supabase.from('contacts').select('id').eq('id', contactId).maybeSingle();
  if (!contact) return { error: 'איש הקשר לא נמצא' };
  await linkPhoneToContact(supabase, conversation.phone, contactId);
  return { success: true };
}
