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
  'הערה', 'הערות מנהל', 'אחראי', 'בן/בת זוג מקושר/ת',
];

// אינדקס-עמודה (0-based) -> אות-עמודה ("A","B",...,"Z","AA",...) - נדרש
// כי כל טווחי ה-Sheets API מבוססי-אות, לא אינדקס, ו-CAMPAIGN_SHEET_HEADER_ROW
// גדל/משתנה עם הזמן (ר' תיקון 2026-08-31: 19->24 עמודות).
export function columnLetter(index0) {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

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
export async function formatCampaignSheet(accessToken, spreadsheetId, sheetId, { categoryOptions = [], statusOptions = [], decisionOptions = [], columnCount = CAMPAIGN_SHEET_HEADER_ROW.length, dataRowCount = 10000 } = {}) {
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
  // אינדקסים מחושבים מתוך הכותרות עצמן - לא קבועים - כדי שהוספת עמודה
  // באמצע ה-header (כמו "בתור-שיחות", 2026-08-31) לא תשבור שוב את מיקום
  // ה-dataValidation/הצביעה-לפי-ערך של עמודות אחרות בטעות.
  const categoryColIndex = CAMPAIGN_SHEET_HEADER_ROW.indexOf('קטגוריה');
  const statusColIndex = CAMPAIGN_SHEET_HEADER_ROW.indexOf('סטטוס');
  const decisionColIndex = CAMPAIGN_SHEET_HEADER_ROW.indexOf('החלטת מיפוי');
  const decisionColLetter = columnLetter(decisionColIndex);

  const categoryColLetter = columnLetter(categoryColIndex);
  const categoryColorRules = categoryOptions.map((value, i) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [fullRowRange],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$${categoryColLetter}2="${escapeFormulaValue(value)}"` }] },
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
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$${decisionColLetter}2="לא רלוונטי"` }] },
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
    dataValidationRequest(categoryColIndex, categoryOptions), // קטגוריה
    dataValidationRequest(statusColIndex, statusOptions), // סטטוס
    dataValidationRequest(decisionColIndex, decisionOptions), // החלטת מיפוי
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
  // אותיות-עמודה מחושבות מתוך הכותרות עצמן - לא קבועות, ר' הערה מקבילה
  // ב-formatCampaignSheet (2026-08-31: הוספת "בתור-שיחות" הזיזה את
  // "החלטת מיפוי" מ-H ל-I, ו-column: 'H' הקשיח כאן נשאר שגוי בטעות).
  const categoryColLetter = columnLetter(CAMPAIGN_SHEET_HEADER_ROW.indexOf('קטגוריה'));
  const decisionColLetter = columnLetter(CAMPAIGN_SHEET_HEADER_ROW.indexOf('החלטת מיפוי'));
  const lastColLetter = columnLetter(CAMPAIGN_SHEET_HEADER_ROW.length - 1);
  const tabs = [
    ...categoryOptions.filter((v) => v.trim() !== 'לא רלוונטי').map((value) => ({ title: sanitizeTitle(value), column: categoryColLetter, value })),
    { title: 'לא רלוונטי', column: decisionColLetter, value: 'לא רלוונטי' },
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
      [`=QUERY('${sheetTitle}'!A1:${lastColLetter}, "select * where ${t.column} = '${escapeQuery(t.value)}'", 1)`],
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

// זהה לחלוטין למנגנון addCategoryViewTabs (QUERY חי, אידמפוטנטי לפי
// existingTitles) - רק על עמודת "אחראי" (responsible_person, טקסט חופשי)
// במקום "קטגוריה". במכוון פונקציה נפרדת (לא refactor משותף) - הקובץ הזה
// כבר גרם לתקרית אובדן-נתונים אמיתית פעם אחת (יישור-עמודות שגוי); לא
// נוגעים בקוד-הקטגוריה העובד כדי להוסיף כאן.
export async function addResponsiblePersonViewTabs(accessToken, spreadsheetId, sheetTitle, responsibleOptions = [], existingTitles = new Set()) {
  const sanitizeTitle = (v) => v.replace(/[\[\]*?:/\\]/g, '').slice(0, 90);
  const escapeQuery = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const responsibleColLetter = columnLetter(CAMPAIGN_SHEET_HEADER_ROW.indexOf('אחראי'));
  const lastColLetter = columnLetter(CAMPAIGN_SHEET_HEADER_ROW.length - 1);
  const tabs = responsibleOptions
    .map((value) => ({ title: sanitizeTitle(`אחראי: ${value}`), value }))
    .filter((t) => !existingTitles.has(t.title));
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
    throw new Error('יצירת טאבים לפי אחראי נכשלה: ' + batchData.error?.message);
  }

  const data = tabs.map((t) => ({
    range: `'${t.title}'!A1`,
    values: [
      [`תצוגה חיה בלבד - לעריכה יש לחזור לטאב "${sheetTitle}"`],
      [`=QUERY('${sheetTitle}'!A1:${lastColLetter}, "select * where ${responsibleColLetter} = '${escapeQuery(t.value)}'", 1)`],
    ],
  }));
  const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  if (!valuesRes.ok) {
    const errData = await valuesRes.json();
    throw new Error('כתיבת נוסחאות לטאבי-אחראי נכשלה: ' + errData.error?.message);
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

// כותבת-מחדש את שורת-הכותרות (row 1) - נדרש כי היא נכתבת פעם אחת בלבד
// ב-createSpreadsheet, ולעולם לא מתעדכנת אוטומטית אחר-כך: הוספת עמודה
// חדשה בקוד (CAMPAIGN_SHEET_HEADER_ROW) לא משנה שום דבר בגיליון שכבר
// מחובר, אלא אם קוראים לפונקציה הזו במפורש (ר' backfillSheetNewColumns).
export async function updateSheetHeaderRow(accessToken, spreadsheetId, sheetTitle, headerRow) {
  const range = encodeURIComponent(`${sheetTitle}!A1:${columnLetter(headerRow.length - 1)}1`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [headerRow] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('עדכון שורת הכותרות נכשל: ' + data.error?.message);
}

// כתיבה לתאים מפוזרים (טווח קטן לכל שורה, לא רצף אחד) - values:batchUpdate
// מקבל מערך של {range, values} ומבצע את כולם בקריאת API אחת, בניגוד
// ל-appendRows שרק מוסיפה בסוף. משמש למילוי-לאחור (backfill) של עמודות
// חדשות בשורות שכבר קיימות בגיליון, בלי לגעת בשום תא אחר (למשל עריכות
// ידניות בעמודות קטגוריה/סטטוס).
export async function batchUpdateCellRanges(accessToken, spreadsheetId, data) {
  if (!data || data.length === 0) return;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  const resData = await res.json();
  if (!res.ok) throw new Error('כתיבת עדכונים לגיליון Google נכשלה: ' + resData.error?.message);
  return resData;
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
