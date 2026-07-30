/** @type {import('next').NextConfig} */

// כותרות אבטחה בסיסיות - הגנה מפני clickjacking (frame-ancestors/X-Frame-Options),
// MIME sniffing, ודליפת מידע ב-Referrer. ה-CSP מוגבל ל'self' + Supabase
// (REST/Realtime/Storage) בלבד - כל שאר הקריאות החיצוניות (Anthropic, Google,
// Zoom, InforU) נעשות מהשרת (server actions/route handlers), לא מהדפדפן,
// ולכן לא כפופות ל-connect-src כאן כלל.
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
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
    ];
  },
};

module.exports = nextConfig;
