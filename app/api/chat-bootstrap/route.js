import { NextResponse } from 'next/server';
import { loadChatBootstrap } from '../../dashboard/chat/loadChatBootstrap';

// נקודת קצה REST רגילה (במקום קריאת server action ישירה מלקוח) עבור
// FloatingChat.js - כדי לטעון את נתוני פתיחת הצ'אט לחלון צף.
export async function GET() {
  const data = await loadChatBootstrap();
  if (data.redirectToLogin) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json(data.props);
}
