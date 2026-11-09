/** @type {import('next').NextConfig} */

// כותרות אבטחה בסיסיות - הגנה מפני clickjacking (frame-ancestors/X-Frame-Options),
// MIME sniffing, ודליפת מידע ב-Referrer. ה-CSP מוגבל ל'self' + Supabase
// (REST/Realtime/Storage) בלבד - כל שאר הקריאות החיצוניות (Anthropic, Google,
// Zoom, InforU) נעשות מהשרת (server actions/route handlers), לא מהדפדפן,
// ולכן לא כפופות ל-connect-src כאן כלל. היוצא-מן-הכלל היחיד: גופני
// Google Fonts (עיצוב-מחדש של לידים/שירות, ר' app/layout.js) - נטענים
// מהדפדפן עצמו, ולכן style-src/font-src מורחבים נקודתית אליהם בלבד.
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self' https://fonts.gstatic.com",
  // נגן ההקלטות בכרטיס איש קשר/מסך שיחות טוען קובץ מדיה מ-015pbx.net
  // (קישורים ישנים/לא-מותאמים) וגם מ-Supabase Storage (bucket
  // call-recordings - העתק שלנו של הקלטות 015, ר' poll-call-recordings) -
  // בלי media-src מפורש, default-src 'self' חוסם את שניהם.
  "media-src 'self' https://015pbx.net https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  // ברירת המחדל של Server Actions היא 1MB - העלאת מסמך/תמונה (ת"ז, תעודה)
  // מעל הגודל הזה נכשלה בשקט, במיוחד בעמוד הרישום הציבורי. 6MB מכסה את
  // תקרת ה-5MB שנאכפת בפועל ב-lib של העלאת המסמכים (documentUploads.js).
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
      // דף הרישום הציבורי: הכתובת כוללת טוקן אישי - לא נשלחת כ-Referer לאתרים
      // אחרים (גם בלי תלות ב-metadata של העמוד). חייב לבוא *אחרי* הכלל הכללי
      // למעלה - כשכמה כללים מתאימים לאותו נתיב, האחרון גובר.
      {
        source: '/register/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/pay/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

module.exports = nextConfig;
