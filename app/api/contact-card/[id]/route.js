import { NextResponse } from 'next/server';
import { loadContactCardData } from '../../../dashboard/contacts/[id]/loadContactCardData';

// נקודת קצה REST רגילה (במקום קריאת server action ישירה מלקוח) עבור
// FloatingContactCard.js - כדי לטעון נתוני כרטיס איש קשר לחלון צף.
export async function GET(request, { params }) {
  const data = await loadContactCardData(params.id);
  if (data.redirectToLogin) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (data.notFound) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(data.props);
}
