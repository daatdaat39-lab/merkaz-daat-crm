// לוגיקה משותפת לשיחות WhatsApp (טבלת whatsapp_conversations, migration 0196):
// שיחה אחת לכל מספר טלפון, עם בעלים, סטטוס וזמן המתנה. בשימוש גם מהקליטה
// (lib/whatsapp/ingestIncoming.js) וגם מכל שליחה יוצאת, כדי שהסטטוס של
// השיחה יישאר נכון מכל נתיב. קובץ רגיל בלי 'use server'.
import { normalizePhoneDigits } from '../../app/dashboard/contacts/phoneRouting';

export const MEDIA_PLACEHOLDER = '[צורף קובץ או תמונה - לצפייה במערכת InforU]';
// חלון השירות של WhatsApp: טקסט חופשי מותר רק 24 שעות מההודעה האחרונה של הלקוח
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function preview(text) {
  return (text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 200);
}

// איש קשר לפי 9 הספרות האחרונות - phone/phone2 (עמודות phone_digits
// מאונדקסות, migration 0065) ואז contact_phones ("טלפונים נוספים").
export async function findContactIdByPhone(supabase, phone) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7) return null;
  const { data: direct } = await supabase
    .from('contacts').select('id')
    .or(`phone_digits.eq.${digits},phone2_digits.eq.${digits}`)
    .order('created_at', { ascending: true }).limit(1);
  if (direct?.[0]) return direct[0].id;
  const { data: extra } = await supabase
    .from('contact_phones').select('contact_id').ilike('phone', `%${digits}`).limit(1);
  return extra?.[0]?.contact_id || null;
}

// לאיזה ליד/מחלקה של איש הקשר שייכת שיחת הוואטסאפ: קודם הליד שממנו נשלחה
// ההודעה היוצאת האחרונה, אחר כך ליד פתוח באותה מחלקה, אחר כך הליד הפתוח
// שטופל לאחרונה, ולבסוף כל שיוך קיים.
export async function pickLeadForContact(supabase, contactId) {
  if (!contactId) return null;
  const [{ data: rows }, { data: lastOut }] = await Promise.all([
    supabase.from('contact_departments')
      .select('id, workspace_id, agent_id, stage, opened_process, last_activity_at')
      .eq('contact_id', contactId),
    supabase.from('sent_whatsapp')
      .select('workspace_id, contact_department_id')
      .eq('contact_id', contactId).eq('direction', 'out')
      .order('sent_at', { ascending: false }).limit(1),
  ]);
  const all = [...(rows || [])].sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0));
  const isOpen = (r) => r.opened_process !== false && r.stage !== 'closed';
  const out = lastOut?.[0] || null;

  const picked = (out?.contact_department_id && all.find((r) => r.id === out.contact_department_id))
    || (out?.workspace_id && all.find((r) => r.workspace_id === out.workspace_id && isOpen(r)))
    || all.find(isOpen)
    || (out?.workspace_id && all.find((r) => r.workspace_id === out.workspace_id))
    || all[0]
    || null;

  if (!picked) return out?.workspace_id ? { workspaceId: out.workspace_id, departmentId: null, agentId: null, isOpen: false } : null;
  return { workspaceId: picked.workspace_id, departmentId: picked.id, agentId: picked.agent_id || null, isOpen: isOpen(picked) };
}

export async function getOrCreateConversation(supabase, phone) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7) return null;
  const { data: existing } = await supabase.from('whatsapp_conversations').select('*').eq('phone_digits', digits).maybeSingle();
  if (existing) return existing;
  const { data: created } = await supabase
    .from('whatsapp_conversations')
    .upsert({ phone_digits: digits, phone, status: 'waiting_customer' }, { onConflict: 'phone_digits', ignoreDuplicates: true })
    .select('*').maybeSingle();
  if (created) return created;
  const { data: raced } = await supabase.from('whatsapp_conversations').select('*').eq('phone_digits', digits).maybeSingle();
  return raced || null;
}

// הודעה נכנסת: השיחה ממתינה לנו. waiting_since נשמר מההודעה הראשונה
// שלא נענתה (לא מתאפס בכל הודעה נוספת של הלקוח). הנציג המטפל בליד הוא
// בעל השיחה; בלי נציג - נשאר מי שכבר לקח אותה, או תור המחלקה.
export async function applyInbound(supabase, conversation, { phone, contactId, lead, text, at }) {
  const stillWaiting = conversation.status === 'waiting_us' && conversation.waiting_since;
  await supabase.from('whatsapp_conversations').update({
    phone,
    contact_id: contactId || conversation.contact_id,
    workspace_id: lead?.workspaceId || conversation.workspace_id,
    contact_department_id: lead?.departmentId || conversation.contact_department_id,
    assigned_to: lead?.agentId || conversation.assigned_to,
    status: 'waiting_us',
    waiting_since: stillWaiting ? conversation.waiting_since : at,
    last_inbound_at: at,
    last_message_at: at,
    last_message_preview: preview(text),
    last_direction: 'in',
    closed_by: null,
    closed_at: null,
  }).eq('id', conversation.id);
}

// הודעה יוצאת (מכל נתיב): השיחה עוברת ל"ממתין ללקוח". מי שענה לשיחה בלי
// בעלים הופך לבעלים שלה. מחזיר את מזהה השיחה לשמירה על שורת ההודעה.
export async function noteOutbound(supabase, { phone, contactId, workspaceId, departmentId, userId, text }) {
  const conversation = await getOrCreateConversation(supabase, phone);
  if (!conversation) return null;
  const now = new Date().toISOString();
  const answeredWaiting = conversation.status === 'waiting_us';
  await supabase.from('whatsapp_conversations').update({
    contact_id: conversation.contact_id || contactId || null,
    workspace_id: conversation.workspace_id || workspaceId || null,
    contact_department_id: conversation.contact_department_id || departmentId || null,
    assigned_to: conversation.assigned_to || userId || null,
    status: 'waiting_customer',
    waiting_since: null,
    last_outbound_at: now,
    last_message_at: now,
    last_message_preview: preview(text),
    last_direction: 'out',
    first_response_at: answeredWaiting && !conversation.first_response_at ? now : conversation.first_response_at,
  }).eq('id', conversation.id);
  return conversation.id;
}

// קישור מספר (שיחה + כל ההודעות שלו) לאיש קשר - אחרי יצירת איש קשר ממספר
// לא מזוהה או קישור ידני לאיש קשר קיים. משלים גם מחלקה/ליד/בעלים.
export async function linkPhoneToContact(supabase, phone, contactId) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7 || !contactId) return;
  const lead = await pickLeadForContact(supabase, contactId);
  await supabase.from('sent_whatsapp')
    .update({ contact_id: contactId, workspace_id: lead?.workspaceId || null, contact_department_id: lead?.departmentId || null })
    .eq('phone_digits', digits).is('contact_id', null);
  const { data: conversation } = await supabase.from('whatsapp_conversations').select('id, assigned_to').eq('phone_digits', digits).maybeSingle();
  if (conversation) {
    await supabase.from('whatsapp_conversations').update({
      contact_id: contactId,
      workspace_id: lead?.workspaceId || null,
      contact_department_id: lead?.departmentId || null,
      assigned_to: lead?.agentId || conversation.assigned_to,
    }).eq('id', conversation.id);
  }
}
