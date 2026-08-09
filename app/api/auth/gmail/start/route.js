import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

// מתחיל את תהליך החיבור ל-Gmail של מחלקה נתונה: מפנה את המשתמש למסך
// ההרשאה של Google. כתובת: GET /api/auth/gmail/start?workspace_id=...
// דורש session מחובר + תפקיד owner/admin באותה מחלקה - בלי זה, כל אחד
// באינטרנט (בלי שום חשבון) יכול היה לחבר תיבת Gmail משלו למחלקה כלשהי.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspace_id');
  const purpose = searchParams.get('purpose') === 'send' ? 'send' : 'intake';
  const campaignId = searchParams.get('campaign_id') || '';
  if (!workspaceId) {
    return NextResponse.json({ error: 'יש לציין workspace_id' }, { status: 400 });
  }

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

  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    redirect_uri: process.env.GMAIL_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    state: `${workspaceId}:${purpose}:${campaignId}`,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
