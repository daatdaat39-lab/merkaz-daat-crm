import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { findExistingMatch, upsertDepartmentMembership } from '../../../dashboard/contacts/leadIntakeCore';
import { resolveSourceFromLink } from '../../../dashboard/components/sourceLinks';

// נקודת קליטה ללידים חיצוניים (מייל אוטומטי/טופס אתר/וואטסאפ וכו', דרך
// Zapier/Make וכיו"ב). כתובת: POST /api/leads/intake
// חייבים לשלוח כותרת x-api-key עם הסוד מ-LEAD_INTAKE_SECRET, אחרת נדחה -
// זו נקודת קצה ציבורית שכותבת למסד, ללא session של משתמש מחובר.
export async function POST(request) {
  const configuredSecret = process.env.LEAD_INTAKE_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'LEAD_INTAKE_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const providedSecret = request.headers.get('x-api-key');
  if (providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה חייב להיות JSON תקין' }, { status: 400 });
  }

  const first = (body.first || '').toString().trim();
  const last = (body.last || '').toString().trim(); // עמודת contacts.last היא NOT NULL - לא לשלוח null
  const phone = (body.phone || '').toString().trim() || null;
  const email = (body.email || '').toString().trim() || null;
  const idnum = (body.idnum || '').toString().trim() || null;
  const reason = (body.reason || '').toString().trim();
  const note = (body.note || '').toString().trim() || null;
  const rawSource = (body.source || '').toString().trim();
  // אם המקור הוא קישור (מגיע מ"קישור מקור" שה-AI חילץ מהמייל) - מתרגמים
  // אותו לשם המפרסם לפי טבלת ההתאמה; אם זה כבר טקסט רגיל, נשאר כמו שהוא
  const source = (rawSource.startsWith('http') ? resolveSourceFromLink(rawSource) : rawSource) || 'מייל';
  const workspaceIdParam = (body.workspace_id || '').toString().trim();
  const workspaceNameParam = (body.workspace_name || body.workspace || '').toString().trim();

  if (!first) return NextResponse.json({ error: 'שדה first (שם פרטי) חובה' }, { status: 400 });
  if (!reason) return NextResponse.json({ error: 'שדה reason (מהות הפנייה) חובה' }, { status: 400 });
  if (!workspaceIdParam && !workspaceNameParam) {
    return NextResponse.json({ error: 'יש לציין workspace_id או workspace_name (שם המחלקה)' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const workspaceQuery = supabase.from('workspaces').select('id, name');
  const { data: workspace } = workspaceIdParam
    ? await workspaceQuery.eq('id', workspaceIdParam).single()
    : await workspaceQuery.eq('name', workspaceNameParam).single();

  if (!workspace) {
    return NextResponse.json({ error: `מחלקה לא נמצאה: ${workspaceIdParam || workspaceNameParam}` }, { status: 404 });
  }

  const existing = await findExistingMatch(supabase, { idnum, phone, email });

  let contactId;
  let created = false;

  if (existing) {
    contactId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert({ first, last, phone, email, idnum, source, tags: [] })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contactId = inserted.id;
    created = true;
  }

  await upsertDepartmentMembership(supabase, contactId, workspace, reason, note);

  return NextResponse.json({ success: true, contact_id: contactId, created });
}
