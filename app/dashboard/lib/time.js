// עזרי תאריך לפי שעון ישראל (Asia/Jerusalem). השרת רץ ב-UTC, ולכן
// "היום"/"אתמול"/"החודש" שחושבו עם new Date() ישירות חתכו את היום בשעה
// 02:00-03:00 שעון ישראל, והציגו מספרים של "היום" שכוללים חלק מאתמול.
// כל הפונקציות כאן מחזירות רגעים מוחלטים (ISO/UTC) שמתאימים לחצות בישראל.
const TZ = 'Asia/Jerusalem';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// 'YYYY-MM-DD' של התאריך לפי ישראל
export function israelYmd(date = new Date()) {
  return ymdFormatter.format(date);
}

// הפרש (ms) בין שעון ישראל ל-UTC ברגע הנתון (כולל שעון קיץ)
function tzOffsetMs(date) {
  const o = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour), Number(o.minute), Number(o.second));
  return asUtc - date.getTime();
}

// תחילת היום (00:00 שעון ישראל) כ-ISO; offsetDays=-1 => תחילת אתמול
export function startOfIsraelDay(date = new Date(), offsetDays = 0) {
  const [y, m, d] = israelYmd(date).split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d + offsetDays, 0, 0, 0));
  // שני סבבים - כדי לטפל נכון גם ביום המעבר בין שעון קיץ לחורף
  const first = new Date(guess.getTime() - tzOffsetMs(guess));
  return new Date(guess.getTime() - tzOffsetMs(first)).toISOString();
}

// תחילת החודש הנוכחי (שעון ישראל) כ-ISO
export function startOfIsraelMonth(date = new Date()) {
  const [y, m] = israelYmd(date).split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const first = new Date(guess.getTime() - tzOffsetMs(guess));
  return new Date(guess.getTime() - tzOffsetMs(first)).toISOString();
}
