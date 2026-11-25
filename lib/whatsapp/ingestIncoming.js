// קליטת הודעות WhatsApp נכנסות - מסלול אחד לשני המקורות (משיכה מ-InforU
// ב-cron, ו-Push webhook). כל הודעה נשמרת קודם כמו שהיא ב-
// whatsapp_inbound_raw ורק אז מעובדת: המשיכה מ-InforU מוחקת את ההודעות
// מהתור שלהם, כך שבלי זה כל תקלה בעיבוד הייתה מאבדת הודעה לתמיד. שורה
// שנכשלה נשארת ומעובדת שוב בריצה הבאה (עד MAX_ATTEMPTS).
import crypto from 'crypto';
import { flagOptOutIfKeyword } from '../../app/dashboard/lib/optout';
import { MEDIA_PLACEHOLDER, findContactIdByPhone, pickLeadForContact, getOrCreateConversation, applyInbound } from './conversations';

const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

// payload גולמי -> שדות אחידים. pull: פריט מ-PullData של InforU; push: פריט
// מ-Data של ה-webhook.
function normalize(source, payload) {
  if (source === 'pull') {
    const d = payload?.PullData || {};
    return {
      phone: d.PhoneNumber || null,
      message: d.SentMessage || null,
      channel: d.Network || null,
      mediaUid: d.MediaFileUid || null,
      providerTime: payload?.NotificationDate || payload?.InsertDate || null,
    };
  }
  return {
    phone: payload?.PhoneNumber || null,
    message: payload?.Message || null,
    channel: payload?.Channel || null,
    mediaUid: payload?.MediaFileUid || null,
    providerTime: null,
  };
}

function toIso(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

// מפתח למניעת כפילויות: טלפון + הזמן שהספק דיווח + התוכן. רק כשיש זמן
// מהספק - בלי זה שתי הודעות זהות ("כן", "כן") היו נחשבות בטעות לאחת.
function dedupeKey(item) {
  if (!item.providerTime) return null;
  return crypto.createHash('sha1')
    .update(`${item.phone}|${item.providerTime}|${item.message || ''}|${item.mediaUid || ''}`)
    .digest('hex');
}

async function processOne(supabase, source, payload, receivedAt) {
  const item = normalize(source, payload);
  const text = (item.message || '').trim() || (item.mediaUid ? MEDIA_PLACEHOLDER : '');
  if (!item.phone || !text) return; // אין מה לשמור - לא שגיאה

  const conversation = await getOrCreateConversation(supabase, item.phone);
  const contactId = (await findContactIdByPhone(supabase, item.phone)) || conversation?.contact_id || null;
  const lead = await pickLeadForContact(supabase, contactId);
  const at = toIso(item.providerTime) || receivedAt || new Date().toISOString();

  const { error } = await supabase.from('sent_whatsapp').insert({
    contact_id: contactId,
    workspace_id: lead?.workspaceId || null,
    contact_department_id: lead?.departmentId || null,
    conversation_id: conversation?.id || null,
    phone: item.phone,
    kind: 'chat',
    message: text,
    direction: 'in',
    channel: item.channel,
    sent_at: at,
    external_message_id: dedupeKey(item),
    media_uid: item.mediaUid,
  });
  if (error?.code === UNIQUE_VIOLATION) return; // כבר נקלטה (push + pull, או עיבוד חוזר)
  if (error) throw new Error(error.message);

  if (conversation) await applyInbound(supabase, conversation, { phone: item.phone, contactId, lead, text, at });

  // הליד קופץ לראש הרשימה, והטריגר מ-0156 מסמן את המלצת ה-AI לרענון.
  // לא משנים שלב ולא פותחים מחדש ליד סגור.
  if (lead?.departmentId && lead.isOpen) {
    await supabase.from('contact_departments').update({ last_activity_at: new Date().toISOString() }).eq('id', lead.departmentId);
  }
  await flagOptOutIfKeyword(supabase, contactId, text);
}

// שומר את ההודעות הגולמיות (אם יש חדשות) ומעבד את כל מה שעוד לא עובד.
// זורק רק אם השמירה הגולמית עצמה נכשלה - זה המקרה היחיד שבו הודעה
// עלולה לאבד, ולכן הוא חייב להיות רועש.
export async function ingestIncomingWhatsapp(supabase, source, payloads = []) {
  if (payloads.length) {
    const { error } = await supabase.from('whatsapp_inbound_raw').insert(payloads.map((payload) => ({ source, payload })));
    if (error) {
      console.error('whatsapp ingest: raw insert failed, payloads:', JSON.stringify(payloads));
      throw new Error(`שמירת הודעות נכנסות נכשלה: ${error.message}`);
    }
  }

  const { data: pending } = await supabase
    .from('whatsapp_inbound_raw')
    .select('id, source, payload, received_at, attempts')
    .is('processed_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('received_at', { ascending: true })
    .limit(500);

  let processed = 0;
  let failed = 0;
  for (const row of pending || []) {
    try {
      await processOne(supabase, row.source, row.payload, row.received_at);
      await supabase.from('whatsapp_inbound_raw').update({ processed_at: new Date().toISOString(), error: null }).eq('id', row.id);
      processed++;
    } catch (err) {
      failed++;
      console.error('whatsapp ingest: processing failed for raw row', row.id, err.message);
      await supabase.from('whatsapp_inbound_raw').update({ attempts: row.attempts + 1, error: err.message }).eq('id', row.id);
    }
  }
  return { processed, failed };
}

export async function recordIntegrationHealth(supabase, key, errorMessage = null) {
  const now = new Date().toISOString();
  await supabase.from('integration_health').upsert(
    errorMessage
      ? { key, last_error_at: now, last_error: errorMessage, updated_at: now }
      : { key, last_success_at: now, updated_at: now },
    { onConflict: 'key' }
  );
}
