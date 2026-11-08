// כללי הקישור האישי הציבורי (/register/[token]) - קובץ רגיל משותף לעמוד
// ולפעולות השרת שלו.

// תוקף הקישור מיום יצירת הטוקן (public_token_created_at). רענון הקישור בצד
// הנציג יוצר טוקן חדש ומאפס את הספירה. קישורים ישנים ללא תאריך נחשבים בתוקף.
export const PUBLIC_LINK_TTL_DAYS = 60;

export function isPublicLinkExpired(createdAt) {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() > PUBLIC_LINK_TTL_DAYS * 86400000;
}

// תצוגות מקדימות של קישורים (וואטסאפ, טלגרם, סלאק, מנועי חיפוש) טוענות את
// הדף בלי שאדם פתח אותו - ובלי הסינון הזה "נפתח לאחרונה" מראה פתיחה שלא
// הייתה, ומטעה את הנציג לחשוב שהלקוח התחיל למלא.
const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|skype|embedly|curl|wget|headless/i;
export function isBotUserAgent(userAgent) {
  return !userAgent || BOT_UA.test(userAgent);
}
