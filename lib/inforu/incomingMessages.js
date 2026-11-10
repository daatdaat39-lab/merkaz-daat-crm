// משיכת הודעות-WhatsApp-נכנסות (Pull option) - אושר-בטלפון-מול-תמיכת
// InforU שניתן-להפעיל-את-זה-עצמאית (לא-דורש-הגדרה-מצידם, בניגוד ל-
// Push שדורש-שהם-יגדירו-יעד-לכל-הודעה). כל-קריאה מוציאה-ומוחקת (consume)
// את-ההודעות-מהתור-שלהם - בדיוק-אותו-עיקרון כמו שליפת-הקלטות-015
// (poll-call-recordings) - אין-Webhook, cron-שמושך-כל-כמה-דקות.
// אותו-אימות-Basic כמו sendWhatsAppTemplate/sendWhatsAppChat - כולל
// INFORU_BASE_CREDENTIALS (ר' הערה ב-lib/inforu/whatsapp.js).

function authHeader() {
  const baseCredentials = process.env.INFORU_BASE_CREDENTIALS?.trim();
  if (baseCredentials) {
    return `Basic ${baseCredentials.replace(/^Basic\s+/i, '')}`;
  }
  const user = process.env.INFORU_API_USER;
  const token = process.env.INFORU_API_TOKEN;
  const encoded = Buffer.from(`${user}:${token}`).toString('base64');
  return `Basic ${encoded}`;
}

// מושך-עד-500-הודעות-נכנסות-בבת-אחת (המקסימום-שתועד). מחזיר-מערך-ריק
// אם-אין-כלום-חדש (לא-שגיאה). כל-קריאה-נוספת "מרוקנת"-את-מה-שכבר-נמשך -
// קריאה-תכופה-מדי (פחות-מכמה-דקות) פשוט-תחזיר-ריק, לא-מזיקה.
export async function pullIncomingWhatsapp() {
  const res = await fetch('https://capi.inforu.co.il/api/v2/PullData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ Data: { Type: 'IncomingMessagesWhatsapp', BatchSize: 500 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.StatusId !== 1) {
    throw new Error(`משיכת הודעות-WhatsApp-נכנסות נכשלה: ${data.StatusDescription || res.statusText}`);
  }
  return (data.Data?.List || []).map((item) => ({
    phone: item.PullData?.PhoneNumber || null,
    message: item.PullData?.SentMessage || null,
    channel: item.PullData?.Network || null,
    receivedAt: item.NotificationDate || item.InsertDate || null,
  }));
}
