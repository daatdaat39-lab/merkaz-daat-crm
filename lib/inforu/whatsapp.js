// שליחת הודעת WhatsApp דרך InforUMobile - הודעה ראשונה לאיש קשר חייבת
// להיות "הודעת תבנית" מאושרת (חוק של WhatsApp עצמו, לא של InforU).
// אימות: Basic Authentication עם User+Token מהמערכת שלהם.

function authHeader() {
  const user = process.env.INFORU_API_USER;
  const token = process.env.INFORU_API_TOKEN;
  const encoded = Buffer.from(`${user}:${token}`).toString('base64');
  return `Basic ${encoded}`;
}

// שליחה יוצאת דורשת רק USER/TOKEN; קליטה נכנסת (webhook) דורשת גם
// INFORU_WEBHOOK_SECRET - ר' app/api/webhooks/inforu-whatsapp/route.js.
// אותו רעיון בדיוק כמו isKesherConfigured (lib/kesher/client.js).
export function isInforuConfigured() {
  return Boolean(process.env.INFORU_API_USER && process.env.INFORU_API_TOKEN);
}

export function isInforuWebhookConfigured() {
  return Boolean(process.env.INFORU_WEBHOOK_SECRET);
}

// paramCount - כמה מקומות-פרמטר ([#1#]/[#2#]) יש בפועל בנוסח המאושר של
// התבנית הזו ב-InforU (לא כל התבניות בנויות אותו דבר - ר' migration
// 0115). שליחת יותר פרמטרים ממה שהתבנית מצפה לו (או פחות) נכשלת
// במסירה עם "Operator Response: #132000" - אומת בפועל.
export async function sendWhatsAppTemplate({ phone, firstName, reason, templateId, paramCount = 2 }) {
  templateId = templateId || process.env.INFORU_TEMPLATE_ID;
  if (!templateId) throw new Error('לא נבחרה תבנית לשליחה');

  const allParams = [
    { Name: '[#1#]', Type: 'Custom', Value: 'FirstName' },
    { Name: '[#2#]', Type: 'Custom', Value: 'Reason' },
  ];
  const TemplateParameters = allParams.slice(0, Math.max(0, Math.min(paramCount, allParams.length)));

  const res = await fetch('https://capi.inforu.co.il/api/v2/WhatsApp/SendWhatsApp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({
      Data: {
        TemplateId: templateId,
        TemplateParameters,
        Recipients: [
          { Phone: phone, FirstName: firstName, Reason: reason || 'פנייה כללית' },
        ],
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`שליחת WhatsApp נכשלה: ${data.StatusDescription || res.statusText}`);
  return data;
}

// הודעת צ'אט חופשית - אפשרית רק בתוך 24 שעות מהתשובה האחרונה של הלקוח
// להודעת התבנית (חוק של WhatsApp עצמו).
export async function sendWhatsAppChat({ phone, message }) {
  const res = await fetch('https://capi.inforu.co.il/api/v2/WhatsApp/SendWhatsAppChat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ Data: { Message: message, Phone: phone } }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.StatusDescription !== 'Success') {
    throw new Error(`שליחת ההודעה נכשלה: ${data.StatusDescription || res.statusText} — ייתכן שחלון 24 השעות מתשובת הלקוח האחרונה נסגר`);
  }
  return data;
}
