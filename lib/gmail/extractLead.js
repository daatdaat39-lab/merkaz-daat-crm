// שולח את תוכן המייל ל-Claude ומבקש לחלץ ממנו את פרטי הפונה בפורמט
// קבוע - זה מחליף את שלב ה-"AI by Zapier" שהיה ב-Zap, אבל רץ ישירות
// מהקוד שלנו (Claude Haiku - הכי זול, מספיק בהחלט למשימה כזו).
const PROMPT_TEMPLATE = (subject, body) => `קרא את תוכן המייל הבא וחלץ ממנו את פרטי הפונה: שם פרטי, שם משפחה (אם קיים), טלפון (אם קיים), כתובת מייל (אם קיימת), תיאור קצר של מהות הפנייה, ואם יש בתוכן קישור (URL) שמצביע על מודעה או מפרסם ספציפי - את הקישור הזה.

השב אך ורק ב-JSON תקין (בלי טקסט נוסף לפניו או אחריו), במבנה הבא:
{"first": "...", "last": "...", "phone": "...", "email": "...", "reason": "...", "source_link": "..."}

אם שדה לא מופיע בטקסט - השאר אותו מחרוזת ריקה "".

נושא המייל:
${subject}

תוכן המייל:
${body}`;

export async function extractLeadFromEmail(subject, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: PROMPT_TEMPLATE(subject, body) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`קריאה ל-Claude נכשלה: ${data.error?.message}`);

  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude לא החזיר JSON תקין');
  return JSON.parse(jsonMatch[0]);
}
