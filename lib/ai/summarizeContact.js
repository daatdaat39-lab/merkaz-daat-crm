// מסכם עבור נציג את מצב איש הקשר לפי הערות פנימיות והיסטוריית פעילות
// (פניות, פגישות, משימות, מיילים, וואטסאפ) - אותו דפוס קריאה ל-Claude
// Haiku כמו בחילוץ לידים ממייל (lib/gmail/extractLead.js), הכי זול
// ומספיק בהחלט לסיכום טקסט קצר כזה.
function buildPrompt({ name, notes, inquiries, meetings, tasks, sentEmails, sentWhatsapp }) {
  const lines = [];
  if (notes) lines.push(`הערות פנימיות:\n${notes}`);
  if (inquiries.length) lines.push(`פניות:\n${inquiries.map((i) => `- ${i.reason}${i.note ? ` (${i.note})` : ''}`).join('\n')}`);
  if (meetings.length) lines.push(`פגישות:\n${meetings.map((m) => `- ${m.title || 'פגישה'}${m.notes ? `: ${m.notes}` : ''}`).join('\n')}`);
  if (tasks.length) lines.push(`משימות:\n${tasks.map((t) => `- ${t.title}${t.done ? ' (הושלמה)' : ''}`).join('\n')}`);
  if (sentEmails.length) lines.push(`מיילים שנשלחו:\n${sentEmails.map((e) => `- ${e.subject}`).join('\n')}`);
  if (sentWhatsapp.length) lines.push(`הודעות WhatsApp:\n${sentWhatsapp.map((w) => `- ${w.direction === 'in' ? 'מהלקוח' : 'נשלח'}: ${w.kind === 'chat' ? w.message : (w.reason || 'תבנית')}`).join('\n')}`);

  return `אתה עוזר לנציג מכירות/שירות. הנה כל המידע שיש לנו על איש קשר בשם ${name}:

${lines.join('\n\n') || '(אין עדיין מידע פעילות)'}

כתוב סיכום קצר (3-5 משפטים) בעברית על מצב איש הקשר: מה ביקש, מה נעשה עד כה, ומה נראה כצעד הבא הגיוני. תשובה ישירה, בלי כותרות ובלי JSON - רק טקסט רגיל.`;
}

export async function summarizeContact(data) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: buildPrompt(data) }],
    }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`קריאה ל-Claude נכשלה: ${result.error?.message}`);
  return result.content?.[0]?.text?.trim() || '';
}
