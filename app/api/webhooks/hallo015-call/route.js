import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// נקודת קצה שאליה מערכת הטלפוניה hallo015 (015) שולחת webhook בכל סיום
// שיחה (אירוע "Hangup", מוגדר ידנית בפאנל שלהם - Features ← Webhooks).
// מאובטח בטוקן בפרמטר ה-URL, נכשל-סגור אם הסוד לא מוגדר בשרת - אותו
// דפוס בדיוק כמו /api/webhooks/inforu-whatsapp ו-/api/cron/poll-emails.
// לא ברור מראש איזה מהמספרים (snumber/dnumber) הוא הצד החיצוני, אז
// מנסים להתאים איש קשר לפי שניהם.
function normalizePhone(p) {
  return (p || '').replace(/\D/g, '').slice(-9);
}

export async function POST(request) {
  const configuredSecret = process.env.HALLO015_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'HALLO015_WEBHOOK_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get('token') !== configuredSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  // אבחון זמני (להסיר אחרי שנוודא את פורמט answered/direction האמיתי
  // ש-015 שולחת בפועל - לא ניחוש, ר' Vercel Logs).
  console.log('hallo015 webhook body:', JSON.stringify(body));

  const externalCallId = (body.callid || body.uniqueid || '').toString().trim();
  if (!externalCallId) return NextResponse.json({ error: 'missing callid' }, { status: 400 });

  const supabase = createAdminClient();

  const snumber = (body.snumber || '').toString().trim() || null;
  const dnumber = (body.dnumber || '').toString().trim() || null;

  let contactId = null;
  for (const num of [snumber, dnumber]) {
    if (!num || contactId) continue;
    const normalized = normalizePhone(num);
    if (!normalized) continue;
    const results = await Promise.all([
      supabase.from('contacts').select('id').eq('phone', num).limit(1),
      supabase.from('contacts').select('id').eq('phone2', num).limit(1),
    ]);
    for (const { data } of results) {
      if (data?.[0]) { contactId = data[0].id; break; }
    }
  }

  const toNumber = (v) => (v ? Number(v) : null);
  const toDate = (v) => (v ? new Date(Number(v) * 1000 || v) : null);

  const { error } = await supabase.from('phone_calls').upsert({
    contact_id: contactId,
    external_call_id: externalCallId,
    direction: body.direction || null,
    snumber,
    dnumber,
    extension: (body.extension || '').toString().trim() || null,
    status: body.status || null,
    answered: body.answered === '1' || body.answered === 1 || body.answered === true,
    duration_seconds: toNumber(body.totaltime),
    recording_url: (body.recording || '').toString().trim() || null,
    started_at: toDate(body.start),
    ended_at: toDate(body.end),
  }, { onConflict: 'external_call_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, matched: !!contactId });
}
