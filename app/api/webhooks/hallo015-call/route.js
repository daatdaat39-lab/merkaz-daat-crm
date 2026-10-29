import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { normalizePhone } from '../../../../lib/hallo015/config';

// נקודת קצה שאליה מערכת הטלפוניה hallo015 (015) שולחת webhook - **שתי**
// תבניות מוגדרות ידנית בפאנל שלהם (Features ← Web Urls Templates),
// לאותו URL/טוקן בדיוק: אחת לאירוע "Calling" (תחילת-שיחה/צלצול - מפעילה
// הקפצת-מסך בזמן-אמת, ר' להלן) ואחת לאירוע "Hangup" (סיום-שיחה - מעדכנת
// את שורת phone_calls עם הפרטים-הסופיים). מאובטח בטוקן בפרמטר ה-URL,
// נכשל-סגור אם הסוד לא מוגדר בשרת - אותו דפוס בדיוק כמו
// /api/webhooks/inforu-whatsapp ו-/api/cron/poll-emails.
// לא ברור מראש איזה מהמספרים (snumber/dnumber) הוא הצד החיצוני, אז
// מנסים להתאים איש קשר לפי שניהם.

export async function POST(request) {
  const configuredSecret = process.env.HALLO015_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'HALLO015_WEBHOOK_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get('token') !== configuredSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // הטמפלט שהוגדר בפאנל של 015 (Features ← Webhooks) משאיר כמה שדות
  // בלי מרכאות (start/uniqueid/callid/totaltime/talktime/answered) כדי
  // שיוצבו כמספר/בוליאני גולמי - אבל אם 015 שולחת ערך ריק לאחד מהם
  // (לדוגמה שיחה שלא נענתה, totaltime ריק), זה שובר את תחביר ה-JSON
  // (":" ואחריו ישר "," בלי שום ערך ביניהם - אומת ב-Vercel Logs, שיחת
  // בדיקה אמיתית נפלה בדיוק על זה). מתקנים דפנסיבית: "," את כל ":"
  // שאחריו ישר "," או "}" (בלי ערך) עם null, ומנסים שוב לפני שנכשלים.
  const rawText = await request.text();
  console.log('hallo015 webhook raw body:', rawText);
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    try {
      body = JSON.parse(rawText.replace(/:(\s*)([,}])/g, ':null$2'));
    } catch {
      body = null;
    }
  }
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const externalCallId = (body.callid || body.uniqueid || '').toString().trim();
  if (!externalCallId) return NextResponse.json({ error: 'missing callid' }, { status: 400 });

  const supabase = createAdminClient();

  const snumber = (body.snumber || '').toString().trim() || null;
  const dnumber = (body.dnumber || '').toString().trim() || null;

  // תוקן (שלב 5 ממודול מכירות/שירות - נמצא בגילוי-פערים, לא קשור
  // לפיצ'ר החדש): הייתה כאן השוואה מדויקת מול phone/phone2 הגולמיים,
  // בלי להשתמש במספר המנורמל שכבר חושב - אף התאמה לא הצליחה בפועל
  // כי המספרים ב-015 (snumber/dnumber) כמעט אף פעם לא זהים-תו-לתו
  // לאיך שהטלפון שמור אצלנו (קידומת/אפס-מוביל). משתמשים ב-phone_digits/
  // phone2_digits (עמודות מחושבות, 9 ספרות אחרונות, migration 0065) -
  // אותו נירמול בדיוק כמו normalizePhone, ומאונדקס.
  let contactId = null;
  for (const num of [snumber, dnumber]) {
    if (!num || contactId) continue;
    const normalized = normalizePhone(num);
    if (!normalized) continue;
    const results = await Promise.all([
      supabase.from('contacts').select('id').eq('phone_digits', normalized).limit(1),
      supabase.from('contacts').select('id').eq('phone2_digits', normalized).limit(1),
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

  // הקפצת-מסך - ברגע-הצלצול (אירוע "Calling", לא "Hangup" יותר - ר'
  // ההערה למעלה). קריטי: מגודר **רק** ל-Calling - אחרת שני האירועים
  // (Calling+Hangup) לאותה שיחה ייצרו שתי שורות-cti_call_events ושני
  // טוסטים-כפולים לנציג על שיחה אחת. רק לשיחות-נכנסות (direction שונה
  // מ-'outbound', אותה מוסכמה כמו בתצוגה הקיימת ב-ContactTabs.js) עם
  // ניתוב-קו מוגדר (cti_line_routing, migration 0153) - בלי ניתוב, אין
  // workspace לשייך את ההתראה אליו, אז מדלגים בשקט (הרישום ב-phone_calls
  // כבר קרה למעלה, לא תלוי בזה).
  const isInbound = body.direction !== 'outbound';
  const isCallingEvent = (body.status || '').toString().trim().toLowerCase() === 'calling';
  if (isCallingEvent && isInbound && dnumber) {
    const { data: routing } = await supabase.from('cti_line_routing').select('workspace_id').eq('dnumber', dnumber).maybeSingle();
    if (routing?.workspace_id) {
      let departmentId = null;
      let agentId = null;
      if (contactId) {
        // .maybeSingle() היה-זורק-שגיאה-אם-לאיש-הקשר-כמה-שורות-באותה-
        // מחלקה (ר' course_id, migration 0164) - לוקחים-את-הפעילה-ביותר.
        const { data: deptRows } = await supabase
          .from('contact_departments')
          .select('id, agent_id, last_activity_at')
          .eq('contact_id', contactId)
          .eq('workspace_id', routing.workspace_id)
          .order('last_activity_at', { ascending: false });
        const dept = (deptRows || [])[0];
        departmentId = dept?.id || null;
        agentId = dept?.agent_id || null;
      }
      await supabase.from('cti_call_events').insert({
        workspace_id: routing.workspace_id, contact_id: contactId, department_id: departmentId,
        agent_id: agentId, phone: snumber, answered: body.answered === '1' || body.answered === 1 || body.answered === true,
      });
    }
  }

  return NextResponse.json({ success: true, matched: !!contactId });
}
