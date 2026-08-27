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
// ראשונה - מחזיר גם spreadsheetId וגם sheetId (המזהה המספרי של הגיליון-
// משנה, נדרש לבקשות עיצוב/ולידציה ב-batchUpdate) וקישור ישיר לפתיחה.
export async function createSpreadsheet(accessToken, title, sheetTitle, headerRow) {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheetTitle, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('יצירת גיליון Google נכשלה: ' + data.error?.message);

  await appendRows(accessToken, data.spreadsheetId, sheetTitle, [headerRow]);
  return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, sheetId: data.sheets[0].properties.sheetId };
}

// עיצוב + רשימות נפתחות (data validation) - נקרא פעם אחת מיד אחרי יצירת
// הגיליון. שורת כותרות מודגשת עם רקע צבעוני (אותו טון ירוק-כהה של המותג),
// עמודות "קטגוריה"/"סטטוס"/"החלטת מיפוי" מקבלות רשימה נפתחת אמיתית לפי
// הערכים האמיתיים של המחלקה/הקמפיין - כדי שממפה לא יקליד חופשי (ומטעה
// שגיאות הקלדה) אלא יבחר מרשימה סגורה, ושבחירת "לא רלוונטי" ב"החלטת
// מיפוי" תמיד תואמת בדיוק לערך שהמסך במערכת מצפה לו. strict:false בכל
// ולידציה - כדי לא לחסום ערך חופשי אם מישהו בכל זאת ירצה, רק להציע.
export async function formatCampaignSheet(accessToken, spreadsheetId, sheetId, { categoryOptions = [], statusOptions = [], decisionOptions = [], columnCount = 17, dataRowCount = 2000 } = {}) {
  const HEADER_BG = { red: 0.145, green: 0.353, blue: 0.298 };
  const HEADER_FG = { red: 1, green: 1, blue: 1 };

  const dataValidationRequest = (columnIndex, options) => options.length === 0 ? null : {
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, endRowIndex: dataRowCount, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: options.map((v) => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: false,
      },
    },
  };

  const requests = [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: { userEnteredFormat: { backgroundColor: HEADER_BG, textFormat: { foregroundColor: HEADER_FG, bold: true } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    dataValidationRequest(4, categoryOptions), // קטגוריה
    dataValidationRequest(6, statusOptions), // סטטוס
    dataValidationRequest(7, decisionOptions), // החלטת מיפוי
    {
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: dataRowCount, startColumnIndex: 0, endColumnIndex: columnCount },
          rowProperties: {
            headerColor: HEADER_BG,
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.941, green: 0.961, blue: 0.949 },
          },
        },
      },
    },
  ].filter(Boolean);

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error('עיצוב גיליון Google נכשל: ' + data.error?.message);
  }
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
