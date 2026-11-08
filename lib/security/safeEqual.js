import crypto from 'crypto';

// השוואת סודות בזמן קבוע - `!==` רגיל נעצר בתו הראשון שלא תואם, ומאפשר
// בעיקרון לנחש טוקן תו-אחר-תו לפי זמן התגובה. ה-hash לפני ההשוואה מבטיח
// שני באפרים באותו אורך (timingSafeEqual זורק על אורכים שונים) בלי לחשוף
// את אורך הסוד.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
