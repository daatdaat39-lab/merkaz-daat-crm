// שליחת מייל דרך Gmail API - בונה הודעת MIME גולמית (RFC 2822),
// מקודדת ב-base64url, ושולחת דרך users.messages.send. הנושא מקודד
// ב-RFC 2047 (UTF-8/Base64) כדי שעברית תוצג נכון אצל הנמען.

function encodeSubject(subject) {
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf-8').toString('base64') + '?=';
}

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendEmail(accessToken, { from, to, subject, body }) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64UrlEncode(message) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`שליחת מייל נכשלה: ${data.error?.message}`);
  return data;
}
