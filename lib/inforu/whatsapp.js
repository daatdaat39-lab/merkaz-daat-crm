// שליחת הודעת WhatsApp דרך InforUMobile - הודעה ראשונה לאיש קשר חייבת
// להיות "הודעת תבנית" מאושרת (חוק של WhatsApp עצמו, לא של InforU).
// אימות: Basic Authentication עם User+Token מהמערכת שלהם.

function authHeader() {
  const user = process.env.INFORU_API_USER;
  const token = process.env.INFORU_API_TOKEN;
  const encoded = Buffer.from(`${user}:${token}`).toString('base64');
  return `Basic ${encoded}`;
}

export async function sendWhatsAppTemplate({ phone, firstName, reason }) {
  const templateId = process.env.INFORU_TEMPLATE_ID;
  if (!templateId) throw new Error('התבנית עדיין לא אושרה / לא הוגדר INFORU_TEMPLATE_ID');

  const res = await fetch('https://capi.inforu.co.il/api/v2/WhatsApp/SendWhatsApp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({
      Data: {
        TemplateId: templateId,
        TemplateParameters: [
          { Name: '[#1#]', Type: 'Custom', Value: 'FirstName' },
          { Name: '[#2#]', Type: 'Custom', Value: 'Reason' },
        ],
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
