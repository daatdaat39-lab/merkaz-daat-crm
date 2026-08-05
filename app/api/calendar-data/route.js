import { NextResponse } from 'next/server';
import { loadCalendarData } from '../../dashboard/calendar/loadCalendarData';

// נקודת קצה REST (במקום קריאת server action ישירה מלקוח) עבור
// FloatingCalendar.js - כדי לטעון נתוני יומן לחלון צף, אותו דפוס בדיוק
// כמו /api/contact-card/[id].
export async function GET() {
  const data = await loadCalendarData();
  if (data.redirectToLogin) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json(data.props);
}
