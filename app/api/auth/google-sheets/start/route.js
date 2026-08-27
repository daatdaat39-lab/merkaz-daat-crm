import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

// מתחיל חיבור Google Sheet לקמפיין: מפנה למסך ההרשאה של Google עם scope
// spreadsheets בלבד. כתובת: GET /api/auth/google-sheets/start?campaign_id=...
// דורש session מחובר + תפקיד owner/admin במחלקה של הקמפיין - אותה בדיקה
// בדיוק כמו /api/auth/gmail/start.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaign_id');
  if (!campaignId) {
    return NextResponse.json({ error: 'יש לציין campaign_id' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('workspace_id', campaign.workspace_id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'רק בעלים/מנהל של המחלקה יכול לחבר גיליון' }, { status: 403 });
  }

  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_SHEETS_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    state: campaignId,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
