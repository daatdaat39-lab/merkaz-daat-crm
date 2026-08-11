// עטיפה דקה מעל Gmail API - רענון טוקן, שליפת מיילים חדשים, ופענוח
// תוכן המייל (base64url + multipart) לטקסט רגיל.

export async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`רענון טוקן נכשל: ${data.error_description || data.error}`);
  return data.access_token;
}

// מחזיר עד 10 מזהי הודעות חדשות מהתיבה שהגיעו אחרי afterUnixSeconds -
// מוציא קטגוריות "מבצעים"/"רשתות חברתיות" של Gmail עצמו כהגנה זולה
// ומשלימה לפני שהתוכן בכלל מגיע לסיווג ה-AI (extractLeadFromEmail).
export async function listNewMessageIds(accessToken, afterUnixSeconds) {
  const q = `after:${afterUnixSeconds} -category:promotions -category:social`;
  const params = new URLSearchParams({ q, maxResults: '10' });
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`שליפת רשימת מיילים נכשלה: ${data.error?.message}`);
  return (data.messages || []).map((m) => m.id);
}

function decodeBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// מחפש רקורסיבית את חלק ה-text/plain בגוף המייל (מיילים מגיעים
// לרוב כ-multipart עם כמה חלקים - HTML, טקסט, מצורפים)
function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ');
  }
  return '';
}

export async function getMessage(accessToken, messageId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`שליפת מייל נכשלה: ${data.error?.message}`);

  const headers = data.payload?.headers || [];
  const subject = headers.find((h) => h.name === 'Subject')?.value || '';
  const from = headers.find((h) => h.name === 'From')?.value || '';
  const body = extractPlainText(data.payload).trim();

  return { id: messageId, subject, from, body };
}

// מחפש רקורסיבית חלק עם קובץ מצורף (יש לו body.attachmentId במקום
// body.data - כך Gmail מסמן חלק שהתוכן שלו לא כלול בתשובה עצמה וצריך
// קריאה נפרדת ל-getAttachmentBytes) - אותו עץ payload.parts בדיוק כמו
// extractPlainText, לא נוגעים בה כדי לא לסכן את זרימת קליטת הלידים.
function findAttachment(payload) {
  if (!payload) return null;
  if (payload.body?.attachmentId) {
    return { filename: payload.filename || '', mimeType: payload.mimeType || '', attachmentId: payload.body.attachmentId };
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findAttachment(part);
      if (found) return found;
    }
  }
  return null;
}

// גרסה מצומצמת של getMessage שמחפשת קובץ מצורף במקום גוף טקסט - לשימוש
// ייעודי בפייפליין קליטת הקלטות שיחה מ-015 (לא בקליטת לידים הרגילה).
export async function getMessageWithAttachment(accessToken, messageId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`שליפת מייל נכשלה: ${data.error?.message}`);

  const headers = data.payload?.headers || [];
  return {
    id: messageId,
    subject: headers.find((h) => h.name === 'Subject')?.value || '',
    from: headers.find((h) => h.name === 'From')?.value || '',
    attachment: findAttachment(data.payload),
  };
}

// שולף את הבייטים בפועל של קובץ מצורף - Gmail לא כולל אותם ב-format=full
// הרגיל (רק את attachmentId), צריך קריאה נפרדת.
export async function getAttachmentBytes(accessToken, messageId, attachmentId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`שליפת קובץ מצורף נכשלה: ${data.error?.message}`);
  return Buffer.from((data.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
