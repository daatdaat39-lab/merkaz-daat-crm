import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// מקבל את התשובה מ-Google אחרי שהמשתמש אישר גישה, מחליף את הקוד
// הזמני ב-refresh_token קבוע, ושומר את החיבור למחלקה שהתבקשה
// (workspace_id הגיע דרך פרמטר ה-state ששלחנו ב-/start). בודקים שוב
// כאן session+תפקיד - לא סומכים רק על ה-state שחוזר מגוגל, כי הוא
// עובר דרך הדפדפן של מי שמאשר ולא מאומת מולנו בשום שלב אחר.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Google דחה את הבקשה: ${error}` }, { status: 400 });
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'חסר code או state' }, { status: 400 });
  }
  const [workspaceId, purposeRaw, campaignIdRaw] = state.split(':');
  const purpose = purposeRaw === 'send' ? 'send' : purposeRaw === 'call_recordings' ? 'call_recordings' : 'intake';
  const campaignId = campaignIdRaw || null;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'רק בעלים/מנהל של המחלקה יכול לחבר תיבת מייל' }, { status: 403 });
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

  // upsert רגיל לא מתאים כאן - האינדקסים הייחודיים על email_connections
  // חלקיים (WHERE campaign_id is/isn't null, ר' migration 0057), ו-
  // onConflict של supabase-js לא יודע לפנות לאינדקס חלקי. בודקים ידנית
  // אם כבר יש שורה מתאימה (לפי workspace_id+purpose+campaign_id, עם
  // .is() ל-null כדי שהשוואה תעבוד נכון) ומעדכנים/יוצרים בהתאם.
  const admin = createAdminClient();
  let existingQuery = admin.from('email_connections').select('id').eq('workspace_id', workspaceId).eq('purpose', purpose);
  existingQuery = campaignId ? existingQuery.eq('campaign_id', campaignId) : existingQuery.is('campaign_id', null);
  const { data: existingConn } = await existingQuery.maybeSingle();

  const row = { workspace_id: workspaceId, purpose, campaign_id: campaignId, email_address: emailAddress, refresh_token: tokenData.refresh_token };
  const { error: dbError } = existingConn
    ? await admin.from('email_connections').update(row).eq('id', existingConn.id)
    : await admin.from('email_connections').insert(row);
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const purposeLabel = purpose === 'send' ? 'לשליחת מיילים' : purpose === 'call_recordings' ? 'לקליטת הקלטות שיחה' : 'לקליטת לידים';
  return new NextResponse(
    `<html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>✅ התיבה ${emailAddress} חוברה בהצלחה (${purposeLabel})!</h2>
      <p>אפשר לסגור את החלון הזה.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
