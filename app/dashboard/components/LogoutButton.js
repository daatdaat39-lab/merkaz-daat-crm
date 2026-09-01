'use client';

import { useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

// מתנתק גם בצד-הלקוח וגם בצד-השרת - server action לבד (signOut על
// supabase/server.js) לא מספיק: אם יש GoTrueClient חי בדף (הסשן-היחיד
// עכשיו, ר' lib/supabase/client.js) עם auto-refresh פעיל, הוא לא יודע
// שה-server action ניקה עוגיית-סשן, ויכול לכתוב אותה מחדש ברענון-הבא
// שלו - זו הייתה בדיוק התופעה שדווחה ("יציאה" לא מתנתקת בפועל).
export default function LogoutButton({ logoutAction, children, style, title }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try { await createClient().auth.signOut(); } catch { /* ממשיכים להתנתקות-שרתית בכל מקרה */ }
    await logoutAction();
  }

  return (
    <button type="button" onClick={handleClick} disabled={busy} title={title} style={style}>
      {children}
    </button>
  );
}
