import { NextResponse } from 'next/server';

// מתחיל את תהליך החיבור ל-Gmail של מחלקה נתונה: מפנה את המשתמש למסך
// ההרשאה של Google. כתובת: GET /api/auth/gmail/start?workspace_id=...
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspace_id');
  const purpose = searchParams.get('purpose') === 'send' ? 'send' : 'intake';
  if (!workspaceId) {
    return NextResponse.json({ error: 'יש לציין workspace_id' }, { status: 400 });
  }

  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    redirect_uri: process.env.GMAIL_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    state: `${workspaceId}:${purpose}`,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
