import './globals.css';
import { createClient } from '../lib/supabase/server';

export const metadata = {
  title: 'מרכז דעת — CRM',
};

// סקריפט inline קטן שרץ לפני hydration - כשההעדפה היא 'system' (או
// שאין משתמש מחובר), קובע data-theme לפי prefers-color-scheme של
// הדפדפן כדי למנוע "הבזק" של המצב הלא-נכון לפני שה-JS של React עולה.
function themeInitScript(serverTheme) {
  return `(function(){try{var t=${JSON.stringify(serverTheme)};if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
}

export default async function RootLayout({ children }) {
  let theme = 'system';
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('theme_preference').eq('id', user.id).single();
      theme = profile?.theme_preference || 'system';
    }
  } catch {}

  return (
    <html lang="he" dir="rtl" data-theme={theme === 'system' ? undefined : theme}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(theme) }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
