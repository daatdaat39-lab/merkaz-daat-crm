import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { normalizePhone } from '../../../../lib/hallo015/config';
import { safeEqual } from '../../../../lib/security/safeEqual';

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
  if (!safeEqual(searchParams.get('token'), configuredSecret)) {
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
  // תיקון-באג-אמיתי-שאומת-בפועל (2026-11-01, חקירת חיוג-יזום): 015 שולחת
  // callid/uniqueid כמספר-גולמי-בלי-מרכאות (ר' ההערה למעלה על הטמפלט) -
  // אבל לערכים האלה (למשל "1793546684.65741166") יש כ-18 ספרות-משמעותיות,
  // יותר-ממה-ש-float64 שומר-בדיוק (~15-17) - JSON.parse "מצליח" בלי-
  // לזרוק-שגיאה, אבל מעגל-בשקט את-הספרה-האחרונה. הוכח-בהשוואה-ישירה-
  // ב-DB: callid שנשמר-מ-calls/make (מוחזר-כ-string, ר' clickToDial.js)
  // היה "...65741166", אבל אותה-שיחה-בדיוק הגיעה-מה-webhook-הזה כ-
  // "...6574116" (ספרה-חסרה) - ולכן ה-upsert (onConflict: external_call_id)
  // לעולם-לא-מצא-את-השורה-שחיוג-היזום כתב-מראש, ונוצרה-שורה-כפולה-בלי-
  // contact_id/workspace_id-המקוריים. מצמידים-מרכאות *על-הטקסט-הגולמי*,
  // לפני-ה-parse, כדי ש-JSON.parse יקבל-מחרוזת (בלי-איבוד-דיוק) ולא-מספר.
  const precisionSafeText = rawText.replace(/"(callid|uniqueid)":(\d+\.\d+)/g, '"$1":"$2"');
  let body;
  try {
    body = JSON.parse(precisionSafeText);
  } catch {
    try {
      body = JSON.parse(precisionSafeText.replace(/:(\s*)([,}])/g, ':null$2'));
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
  const isInbound = body.direction !== 'outbound';

  // שיוך-מחלקה (workspace_id) ל-phone_calls - רק-לשיחות-נכנסות מחושב
  // כאן (ניתוב-דטרמיניסטי-לפי-dnumber, cti_line_routing - זהה-בשני-
  // האירועים Calling/Hangup של אותה-שיחה, אז בטוח-לחשב-בכל-קריאה).
  // שיחות-יוצאות (חיוג-יזום, dialContact) מקבלות workspace_id מראש
  // ע"י הקוד-הקורא ל-calls/make (לפני שה-webhook-הזה בכלל מגיע) - לכן
  // *לא* כוללים את המפתח workspace_id בעדכון-כאן עבורן, כדי לא-לדרוס
  // את-הערך-שכבר-נכתב בחזרה ל-null (upsert מעדכן רק-עמודות-שנשלחות).
  let workspaceId = null;
  if (isInbound && dnumber) {
    const { data: routing } = await supabase.from('cti_line_routing').select('workspace_id').eq('dnumber', dnumber).maybeSingle();
    workspaceId = routing?.workspace_id || null;
  }

  const upsertPayload = {
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
  };
  if (workspaceId) upsertPayload.workspace_id = workspaceId;

  const { error } = await supabase.from('phone_calls').upsert(upsertPayload, { onConflict: 'external_call_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // הקפצת-מסך - ברגע-הצלצול (אירוע "Calling", לא "Hangup" יותר - ר'
  // ההערה למעלה). קריטי: מגודר **רק** ל-Calling - אחרת שני האירועים
  // (Calling+Hangup) לאותה שיחה ייצרו שתי שורות-cti_call_events ושני
  // טוסטים-כפולים לנציג על שיחה אחת.
  //
  // ניתוב ראשוני: שלוחה->נציג-ספציפי (profiles.hallo015_extension) -
  // נבדק-בפועל בפאנל-015 (קווי-טלפון, 2026-11-19) שכל שלוחה שייכת-
  // לאדם-אחד-ספציפי, לא-למחלקה - אז זה אות-ניתוב-מדויק-יותר מקו->מחלקה
  // (cti_line_routing). עדיין-נופל-בחזרה לדפוס-הישן (קו->מחלקה, שידור-
  // לכל-מי-שפתוח-על-ה-workspace) לשלוחות שעדיין-לא-משויכות-לנציג-במערכת.
  const isCallingEvent = (body.status || '').toString().trim().toLowerCase() === 'calling';
  if (isCallingEvent && isInbound && dnumber) {
    let departmentId = null;
    let agentId = null;
    let eventWorkspaceId = workspaceId; // מה-שכבר-חושב-למעלה (cti_line_routing), אם-יש

    const { data: extAgent } = await supabase.from('profiles').select('id').eq('hallo015_extension', dnumber).maybeSingle();
    agentId = extAgent?.id || null;

    if (agentId && contactId) {
      // ההקשר-המיטבי: המחלקה-הספציפית-שבה הנציג-הזה-מטפל-באיש-הקשר-
      // הזה - לא-מוגבל-ל-workspace-שה-ניתוב-הישן-כבר-זיהה (אם-בכלל),
      // כדי שהלחיצה-על-הטוסט תוביל-להקשר-הנכון.
      const { data: deptRows } = await supabase
        .from('contact_departments')
        .select('id, workspace_id, last_activity_at')
        .eq('contact_id', contactId)
        .eq('agent_id', agentId)
        .order('last_activity_at', { ascending: false });
      const dept = (deptRows || [])[0];
      if (dept) { departmentId = dept.id; eventWorkspaceId = dept.workspace_id; }
    }

    if (!agentId && workspaceId) {
      // נפילה-לאחור: הדפוס-הישן (קו->מחלקה) - לשלוחות-שעדיין-לא-
      // משויכות-לנציג-ספציפי במערכת.
      if (contactId) {
        // .maybeSingle() היה-זורק-שגיאה-אם-לאיש-הקשר-כמה-שורות-באותה-
        // מחלקה (ר' course_id, migration 0164) - לוקחים-את-הפעילה-ביותר.
        const { data: deptRows } = await supabase
          .from('contact_departments')
          .select('id, agent_id, last_activity_at')
          .eq('contact_id', contactId)
          .eq('workspace_id', workspaceId)
          .order('last_activity_at', { ascending: false });
        const dept = (deptRows || [])[0];
        departmentId = dept?.id || null;
        agentId = dept?.agent_id || null;
      }
    }

    // בלי-ניתוב-לנציג-ספציפי ובלי-workspace (אין-גם-שלוחה-מוכרת וגם-אין-
    // ניתוב-קו-ישן) - אין-למי-לשייך-את-ההתראה, מדלגים-בשקט (הרישום
    // ב-phone_calls כבר-קרה-למעלה, לא-תלוי-בזה).
    if (agentId || eventWorkspaceId) {
      await supabase.from('cti_call_events').insert({
        workspace_id: eventWorkspaceId, contact_id: contactId, department_id: departmentId,
        agent_id: agentId, phone: snumber, answered: body.answered === '1' || body.answered === 1 || body.answered === true,
      });
    }
  }

  return NextResponse.json({ success: true, matched: !!contactId });
}
