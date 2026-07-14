import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// מקבל את התשובה מ-Google אחרי שהמשתמש אישר גישה, מחליף את הקוד
// הזמני ב-refresh_token קבוע, ושומר את החיבור למחלקה שהתבקשה
// (workspace_id הגיע דרך פרמטר ה-state ששלחנו ב-/start)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const workspaceId = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Google דחה את הבקשה: ${error}` }, { status: 400 });
  }
  if (!code || !workspaceId) {
    return NextResponse.json({ error: 'חסר code או workspace_id' }, { status: 400 });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      redirect_uri: process.env.GMAIL_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.refresh_token) {
    return NextResponse.json({ error: 'לא התקבל refresh_token מ-Google', details: tokenData }, { status: 500 });
  }

  const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profileData = await profileRes.json();
  const emailAddress = profileData.emailAddress;
  if (!emailAddress) {
    return NextResponse.json({ error: 'לא ניתן היה לזהות את כתובת המייל' }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { error: dbError } = await supabase
    .from('email_connections')
    .upsert(
      { workspace_id: workspaceId, email_address: emailAddress, refresh_token: tokenData.refresh_token },
      { onConflict: 'email_address' }
    );
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(
    `<html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>✅ התיבה ${emailAddress} חוברה בהצלחה!</h2>
      <p>אפשר לסגור את החלון הזה.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
