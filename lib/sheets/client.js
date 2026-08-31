// לקוח Google Sheets API - fetch גולמי, בלי SDK, באותו סגנון בדיוק כמו
// lib/gmail/client.js. משתמש באותו Google OAuth client (GMAIL_CLIENT_ID/
// SECRET) עם scope נוסף (spreadsheets) ו-redirect_uri נפרד (Google דורש
// כתובת מדויקת רשומה מראש לכל flow, אי אפשר לחלוק את אותה כתובת עם ה-
// callback של ג'ימייל כי הם מטפלים בפרמטרים שונים).

// כותרות הגיליון - זהות בדיוק לעמודות ה-CSV של "ייצוא למיפוי ידני"
// (CampaignDetailClient.js), כדי שאותה לוגיקת-קריאה תתאים לשני המקורות.
export const CAMPAIGN_SHEET_HEADER_ROW = [
  'מזהה שורה (לא לשנות)', 'שם', 'טלפון', 'מייל', 'קטגוריה', 'נציג מטפל', 'סטטוס', 'בתור-שיחות', 'החלטת מיפוי',
  'מחלקות', 'שנת-שיא (שנה)', 'שנת-שיא (סכום)', 'סה"כ תרומות (מספר)', 'סה"כ תרומות (סכום)',
  'תרומה אחרונה', 'אינטראקציה אחרונה', 'הוראת קבע פעילה', 'קורסים/סמינרים',
  'קורסים תשפ"ו', 'מחזור (ישיבת דעת)', 'שנות לימוד בישיבה',
  'הערה', 'אחראי', 'בן/בת זוג מקושר/ת',
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
      // rowCount מפורש - בלי זה Google נותן ברירת מחדל של 1,000 שורות
      // בלבד, וקמפיינים גדולים (אלפי אנשי קשר) פשוט לא נכנסים בשקט
      // (values.append עם OVERWRITE לא מגדיל את הגריד אוטומטית).
      sheets: [{ properties: { title: sheetTitle, rightToLeft: true, gridProperties: { frozenRowCount: 1, rowCount: 10000 } } }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('יצירת גיליון Google נכשלה: ' + data.error?.message);

  await appendRows(accessToken, data.spreadsheetId, sheetTitle, [headerRow]);
  return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, sheetId: data.sheets[0].properties.sheetId };
}

// פלטת צבעים פסטליים ל"חלוקה לקבוצות" ויזואלית לפי קטגוריה - במקום
// לבנות מחדש קיבוץ-שורות אמיתי (Data > Group rows) שהיה נשבר בכל דחיפה
// (שורות חדשות תמיד מתווספות בסוף הגיליון, לא נכנסות לתוך "הבלוק" של
// הקטגוריה שלהן - ר' הסבר למשתמש). צביעה לפי-ערך (conditional formatting)
// היא היחידה שעמידה לגמרי בפני מיון/סינון/הוספת-שורות-חדשות.
const CATEGORY_COLOR_PALETTE = [
  { red: 0.851, green: 0.918, blue: 0.988 }, // כחול בהיר
  { red: 0.945, green: 0.898, blue: 0.973 }, // סגול בהיר
  { red: 1, green: 0.949, blue: 0.8 },       // צהוב בהיר
  { red: 1, green: 0.898, blue: 0.851 },     // כתום בהיר
  { red: 0.984, green: 0.878, blue: 0.902 }, // ורוד בהיר
  { red: 0.8, green: 0.941, blue: 0.925 },   // טורקיז בהיר
];
const NOT_RELEVANT_BG = { red: 0.88, green: 0.88, blue: 0.88 };

// עיצוב + רשימות נפתחות (data validation) - נקרא פעם אחת מיד אחרי יצירת
// הגיליון. שורת כותרות מודגשת עם רקע צבעוני (אותו טון ירוק-כהה של המותג),
// עמודות "קטגוריה"/"סטטוס"/"החלטת מיפוי" מקבלות רשימה נפתחת אמיתית לפי
// הערכים האמיתיים של המחלקה/הקמפיין - כדי שממפה לא יקליד חופשי (ומטעה
// שגיאות הקלדה) אלא יבחר מרשימה סגורה, ושבחירת "לא רלוונטי" ב"החלטת
// מיפוי" תמיד תואמת בדיוק לערך שהמסך במערכת מצפה לו. strict:false בכל
// ולידציה - כדי לא לחסום ערך חופשי אם מישהו בכל זאת ירצה, רק להציע.
//
// "חלוקה לקבוצות" - שני מנגנונים משלימים, שניהם מבוססי-ערך (לא מיקום-
// שורה) ולכן עמידים בפני דחיפות חדשות/מיון/סינון:
// 1. צביעת כל שורה לפי ערך העמודה "קטגוריה" (conditional formatting) -
//    אותה קטגוריה = אותו צבע, בלי תלות באיפה השורה יושבת בגיליון.
// 2. פילטר מובנה (setBasicFilter) - חצים על שורת הכותרות שמאפשרים לכל
//    אחד למיין/לסנן לפי עמודה בלחיצה, בלי לשנות את הנתונים עצמם.
// שורה עם "לא רלוונטי" ב"החלטת מיפוי" מקבלת אפור מנוקד+קו-חוצה - מסמן
// ויזואלית שהיא תיעלם מהקמפיין במשיכה הבאה. חוקי-הצביעה נבדקים לפי
// סדר-הופעה ברשימה והראשון-שמתאים מנצח - לכן חוק "לא רלוונטי" חייב
// להיות ראשון (לפני חוקי-הקטגוריה), אחרת קטגוריה תמיד תסתיר אותו.
// dataRowCount חייב לכסות את כל הרשת (ר' rowCount ב-createSpreadsheet) -
// אחרת הצביעה-לפי-קטגוריה, הפילטר המובנה של Google והרשימות-הנפתחות
// "נעצרים" בשקט בשורה שבה dataRowCount מסתיים, ושורות קמפיין גדול
// שנדחפות אחריו (למשל שורה 2001 ומעלה) יוצאות בלי צבע/מחוץ לטווח הפילטר.
export async function formatCampaignSheet(accessToken, spreadsheetId, sheetId, { categoryOptions = [], statusOptions = [], decisionOptions = [], columnCount = 19, dataRowCount = 10000 } = {}) {
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

  const fullRowRange = { sheetId, startRowIndex: 1, endRowIndex: dataRowCount, startColumnIndex: 0, endColumnIndex: columnCount };
  const escapeFormulaValue = (v) => v.replace(/"/g, '""');

  const categoryColorRules = categoryOptions.map((value, i) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [fullRowRange],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$E2="${escapeFormulaValue(value)}"` }] },
          format: { backgroundColor: CATEGORY_COLOR_PALETTE[i % CATEGORY_COLOR_PALETTE.length] },
        },
      },
      index: i + 1, // אחרי חוק ה"לא רלוונטי" (index 0) - ר' הסבר למעלה
    },
  }));

  const notRelevantRule = decisionOptions.length === 0 ? null : {
    addConditionalFormatRule: {
      rule: {
        ranges: [fullRowRange],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$H2="לא רלוונטי"' }] },
          format: { backgroundColor: NOT_RELEVANT_BG, textFormat: { strikethrough: true } },
        },
      },
      index: 0,
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
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, endRowIndex: dataRowCount, startColumnIndex: 0, endColumnIndex: columnCount } },
      },
    },
    notRelevantRule,
    ...categoryColorRules,
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

// יוצר, בתוך אותו קובץ, טאב-תצוגה נוסף לכל ערך קטגוריה + טאב "לא רלוונטי"
// (מסונן לפי עמודת "החלטת מיפוי", לא "קטגוריה" - זו רשימת כל מי שסומן
// כלא-שייך לקמפיין). כל טאב הוא נוסחת QUERY חיה שקוראת מהטאב הראשי
// (sheetTitle) - *לא* עותק סטטי - שינוי בטאב הראשי (כולל דחיפה חדשה
// מהמערכת) מופיע כאן אוטומטית, בלי סיכון-כפילות/אובדן-נתונים שהיה נוצר
// מהעתקה ידנית של שורות בין טאבים. **מגבלה מכוונת**: אלה טאבים לקריאה
// בלבד - ⬇ "משוך עדכונים" קורא רק מהטאב הראשי, אז עריכה כאן (לדוגמה
// דריסת תא בתוך תוצאת ה-QUERY) לא תישמר בקמפיין - שורת הערה קבועה בראש
// כל טאב מזכירה את זה. נקרא פעם אחת בזמן יצירת הגיליון (כמו
// formatCampaignSheet) - אם רשימת הקטגוריות של המחלקה תשתנה אחר כך, לא
// ייווצר טאב חדש אוטומטית לערך החדש.
// שמות-הגיליונות הקיימים כבר (spreadsheets.get, שדות מצומצמים בכוונה) -
// נדרש כדי ש-addCategoryViewTabs יהיה אידמפוטנטי: קריאה חוזרת (למשל
// אחרי שנוספו קטגוריות חדשות לקמפיין) לא תיפול על ניסיון ליצור טאב
// בשם שכבר קיים (Google Sheets דוחה שמות כפולים).
export async function getSpreadsheetSheetTitles(accessToken, spreadsheetId) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error('קריאת רשימת הטאבים נכשלה: ' + data.error?.message);
  return new Set((data.sheets || []).map((s) => s.properties.title));
}

export async function addCategoryViewTabs(accessToken, spreadsheetId, sheetTitle, categoryOptions = [], existingTitles = new Set()) {
  const sanitizeTitle = (v) => v.replace(/[\[\]*?:/\\]/g, '').slice(0, 90);
  const escapeQuery = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // "לא רלוונטי" קיים גם כערך-קטגוריה אפשרי וגם כערך-החלטת-מיפוי - כדי
  // לא ליצור שני טאבים כמעט-זהים ("לא רלוונטי" מול "לא רלוונטי (מיפוי)"),
  // מדלגים על טאב-הקטגוריה הכפול ומשאירים רק את טאב-ההחלטה (שמכסה את
  // אותה כוונה בדיוק - "לא שייך לקמפיין הזה"). existingTitles מדלג גם
  // על כל קטגוריה שכבר קיבלה טאב בעבר - קריאה חוזרת מוסיפה רק חדשות.
  const tabs = [
    ...categoryOptions.filter((v) => v.trim() !== 'לא רלוונטי').map((value) => ({ title: sanitizeTitle(value), column: 'E', value })),
    { title: 'לא רלוונטי', column: 'H', value: 'לא רלוונטי' },
  ].filter((t) => !existingTitles.has(t.title));
  if (tabs.length === 0) return;

  const addSheetRequests = tabs.map((t, i) => ({
    addSheet: { properties: { title: t.title, index: i + 1, rightToLeft: true, gridProperties: { frozenRowCount: 2 } } },
  }));
  const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: addSheetRequests }),
  });
  if (!batchRes.ok) {
    const batchData = await batchRes.json();
    throw new Error('יצירת טאבים לקבוצות נכשלה: ' + batchData.error?.message);
  }

  const data = tabs.map((t) => ({
    range: `'${t.title}'!A1`,
    values: [
      [`תצוגה חיה בלבד - לעריכה יש לחזור לטאב "${sheetTitle}"`],
      // הטווח כולל את שורת הכותרות של "מיפוי" (A1, לא A2) עם פרמטר-כותרת 1 -
      // כך QUERY משתמש בה כשורת-הכותרות של התוצאה עצמה (ולא כשורת-נתונים),
      // והלשונית לא נשארת בלי כותרות עמודה. טווח פתוח (בלי מספר-שורה-סופי) -
      // קמפיינים גדולים (אלפי אנשי קשר) חורגים בקלות מ-2000 שורות, וגבול קבוע
      // היה מחסיר אותם מהתצוגה.
      [`=QUERY('${sheetTitle}'!A1:S, "select * where ${t.column} = '${escapeQuery(t.value)}'", 1)`],
    ],
  }));
  const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  if (!valuesRes.ok) {
    const errData = await valuesRes.json();
    throw new Error('כתיבת נוסחאות לטאבים נכשלה: ' + errData.error?.message);
  }
}

// מוסיף שורות בסוף הגיליון - לעולם לא דורס שורות קיימות (הטבלה שכבר יש
// לה תוכן), כדי לא לאבד עריכות שכבר נעשו ישירות בגיליון. insertDataOption
// הוא בכוונה OVERWRITE ולא INSERT_ROWS - INSERT_ROWS מבצע הכנסת-שורה
// אמיתית שיורשת (בדיוק כמו "הוספת שורה" ידנית ב-UI) את העיצוב של השורה
// הסמוכה - ומאחר שהשורה הסמוכה לתחילת הטבלה הריקה היא שורת הכותרות
// הצבועה, כל שורת-נתונים חדשה הייתה יוצאת צבועה כמו הכותרת (נצפה בפועל
// - ר' תיקון). OVERWRITE כותב לתאים הריקים שאחרי הטבלה הקיימת בלי
// "להכניס" שורה חדשה בפועל, כך שתאים חדשים נשארים בלי עיצוב משלהם
// (ועיצוב-לפי-ערך שכבר בנוי - conditional formatting - מוצג נכון).
export async function appendRows(accessToken, spreadsheetId, sheetTitle, rows) {
  if (!rows || rows.length === 0) return;
  const range = encodeURIComponent(`${sheetTitle}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
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
