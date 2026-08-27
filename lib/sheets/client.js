// לקוח Google Sheets API - fetch גולמי, בלי SDK, באותו סגנון בדיוק כמו
// lib/gmail/client.js. משתמש באותו Google OAuth client (GMAIL_CLIENT_ID/
// SECRET) עם scope נוסף (spreadsheets) ו-redirect_uri נפרד (Google דורש
// כתובת מדויקת רשומה מראש לכל flow, אי אפשר לחלוק את אותה כתובת עם ה-
// callback של ג'ימייל כי הם מטפלים בפרמטרים שונים).

// כותרות הגיליון - זהות בדיוק לעמודות ה-CSV של "ייצוא למיפוי ידני"
// (CampaignDetailClient.js), כדי שאותה לוגיקת-קריאה תתאים לשני המקורות.
export const CAMPAIGN_SHEET_HEADER_ROW = [
  'מזהה שורה (לא לשנות)', 'שם', 'טלפון', 'מייל', 'קטגוריה', 'נציג מטפל', 'סטטוס', 'החלטת מיפוי',
  'מחלקות', 'שנת-שיא (שנה)', 'שנת-שיא (סכום)', 'סה"כ תרומות (מספר)', 'סה"כ תרומות (סכום)',
  'תרומה אחרונה', 'אינטראקציה אחרונה', 'הוראת קבע פעילה', 'קורסים/סמינרים',
];

export function isGoogleSheetsConfigured() {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GOOGLE_SHEETS_REDIRECT_URI);
}

// אותה קריאת רענון-טוקן בדיוק כמו lib/gmail/client.js - ה-endpoint הזה
// גנרי לגמרי (grant_type: refresh_token), לא תלוי ב-scope שהתבקש בזמן
// ההרשאה המקורית - עובד לכל refresh_token שהונפק מאותו client.
export async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('רענון טוקן ל-Google Sheets נכשל: ' + (data.error_description || data.error));
  return data.access_token;
}

// יוצר גיליון חדש עם גיליון-משנה יחיד בשם sheetTitle, ושורת כותרות
// ראשונה - מחזיר גם spreadsheetId וגם קישור ישיר לפתיחה.
export async function createSpreadsheet(accessToken, title, sheetTitle, headerRow) {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: sheetTitle } }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('יצירת גיליון Google נכשלה: ' + data.error?.message);

  await appendRows(accessToken, data.spreadsheetId, sheetTitle, [headerRow]);
  return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl };
}

// מוסיף שורות בסוף הגיליון (append אמיתי - INSERT_ROWS - לעולם לא דורס
// שורות קיימות, כדי לא לאבד עריכות שכבר נעשו ישירות בגיליון).
export async function appendRows(accessToken, spreadsheetId, sheetTitle, rows) {
  if (!rows || rows.length === 0) return;
  const range = encodeURIComponent(`${sheetTitle}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error('כתיבה לגיליון Google נכשלה: ' + data.error?.message);
  return data;
}

// קורא את כל התוכן הגולמי של הגיליון (כולל שורת הכותרות, שורה ראשונה) -
// מסתפק בטווח קבוע רחב (A:Z) כדי לא להצטרך לדעת מראש כמה עמודות/שורות יש.
export async function getSheetValues(accessToken, spreadsheetId, sheetTitle) {
  const range = encodeURIComponent(`${sheetTitle}!A:Z`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('קריאת גיליון Google נכשלה: ' + data.error?.message);
  return data.values || [];
}
