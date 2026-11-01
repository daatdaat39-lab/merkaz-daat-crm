// שליפת-הקלטות-שיחה ישירות דרך ה-API-המאומת של 015 (לא דרך-מייל יותר -
// ר' poll-call-recordings/route.js להסבר-המלא-של-הבאג-הישן). אותו-מנגנון-
// אימות-בדיוק כמו clickToDial.js (auth_username/auth_password, חשבון-
// הפאנל-הקיים) - אם חיוג-יזום עובד, זה אמור-לעבוד-איתו.
//
// RECORD_GROUP_ID אומת-ידנית בפאנל (Features → Call recording → Record
// groups) - יש-קבוצה-אחת-בלבד בשם "ישראל ערד", id=7616. לא-סוד (רק מזהה
// פנימי), אבל לא-ניתן-לגזירה-אוטומטית בלי-כניסה-לפאנל - לכן קבוע כאן,
// לא env-var.
const API_BASE = 'https://www.015pbx.net/api/json';
const RECORD_GROUP_ID = 7616;

function authParams() {
  return {
    auth_username: process.env.HALLO015_API_USERNAME,
    auth_password: process.env.HALLO015_API_PASSWORD,
  };
}

export function isRecordingsApiConfigured() {
  return Boolean(process.env.HALLO015_API_USERNAME && process.env.HALLO015_API_PASSWORD);
}

const ERROR_BY_CODE = {
  400: 'פרמטרים שגויים בבקשת-ההקלטות',
  401: 'פרטי-ההתחברות ל-015 שגויים (auth_username/auth_password)',
  402: 'לחשבון המשמש אין הרשאת-הקלטות (record role) ב-015',
  404: 'ההקלטה לא נמצאה, או שאין הרשאה לצפות בה',
};

async function call015(path, params) {
  const search = new URLSearchParams({ ...authParams(), ...params });
  const res = await fetch(`${API_BASE}/${path}/?${search.toString()}`);
  const rawText = await res.text();
  let data;
  try { data = JSON.parse(rawText); } catch { data = {}; }
  const response = data?.responses?.[0];
  const code = Number(response?.code ?? res.status);
  if (code !== 200) {
    throw new Error(ERROR_BY_CODE[code] || response?.message || `קריאה ל-015 נכשלה (קוד ${code || res.status})`);
  }
  return data?.data;
}

// מחזיר מערך-שורות-גולמי (ר' הערה ב-route.js - שדות-השורה לא-מתועדים-
// במלואם ב-API של 015, רק uniqueid מאושר-בוודאות; snumber/cnumber/start/
// totaltime/expires מוסקים-מאפשרויות-המיון המתועדות). startUnixSeconds/
// endUnixSeconds - טווח-זמן לחיפוש (לא-להשאיר-ברירת-מחדל-רחבה-מדי, ר'
// אזהרת-התיעוד על עומס-כבד-על-ה-DB שלהם בלי טווח-תאריכים).
export async function listRecordings({ startUnixSeconds, endUnixSeconds }) {
  const data = await call015('recording/recordings/list', {
    recordgroup: RECORD_GROUP_ID,
    start: startUnixSeconds,
    end: endUnixSeconds,
    complete: 1,
  });
  return Array.isArray(data) ? data : [];
}

// מחזיר { bytes, mimeType } - השדה המדויק-של-קובץ-הקול-בתשובה לא-מתועד-
// במלואו (התיעוד אומר רק "including sound file (base64 encoded)" בלי-
// שם-שדה) - בודק-כמה-שמות-סבירים ומתעד-ללוג אם-אף-אחד-לא-נמצא, כדי
// שאפשר-יהיה-לאבחן-מול-תשובה-אמיתית בלי-לנחש-בעיוורון.
export async function getRecordingAudio(row) {
  const recordId = row.recordid ?? row.id ?? row.record_id;
  const data = await call015('recording/recordings/get', {
    recordgroup: RECORD_GROUP_ID,
    uniqueid: row.uniqueid,
    recordid: recordId,
  });
  const base64 = data?.sound || data?.soundfile || data?.sound_file || data?.file || data?.audio || data?.data;
  if (!base64) {
    console.error('getRecordingAudio: לא נמצא שדה-קובץ-קול בתשובת 015, שדות-זמינים:', Object.keys(data || {}));
    throw new Error('תשובת 015 לא כללה קובץ-קול (שם-שדה לא-ידוע, ראו לוג-שרת)');
  }
  return { bytes: Buffer.from(base64, 'base64'), mimeType: 'audio/wav' };
}
