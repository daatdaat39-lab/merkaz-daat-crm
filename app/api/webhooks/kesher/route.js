import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { runKesherSyncCore } from '../../../dashboard/contacts/kesherSyncCore';
import { safeEqual } from '../../../../lib/security/safeEqual';

// וובהוק מקשר (הגדרות חברה > שירותים > וובהוק): קשר דוחפת לכאן עדכון בכל
// עסקה/התחייבות/לקוח חדשים או מעודכנים. **בכוונה לא סומכים על התוכן**: אין
// חתימה על הבקשה, ולכן הגוף לא נקרא בכלל - הוא רק מעורר ריצת סנכרון קצרה
// (אתמול עד מחר) דרך אותה קריאה מאובטחת-לקריאה-בלבד ל-GetTrans/GetObligations
// שה-cron משתמש בה. כך אימות תשלום מגיע תוך שניות במקום תוך כמה דקות, ושום
// גוף בקשה מזויף לא יכול ליצור או לשנות נתון. האינטגרציה נשארת READ-ONLY.
//
// אבטחה: טוקן סודי בכתובת (?token=) מול KESHER_WEBHOOK_SECRET, בהשוואה בזמן
// קבוע - אותו דפוס כמו inforu-whatsapp. בלי KESHER_WEBHOOK_SECRET בשרת הנתיב
// סגור לגמרי (500) ולא מבצע שום דבר.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// מניעת ריצות חופפות/מוצפות: קשר יכולה לשלוח כמה עדכונים רצופים לאותו תשלום.
// הגנה ברמת מופע שרת בלבד - ה-cron ממשיך לרוץ ומשלים כל מה שדולג כאן.
let running = false;
let lastRunAt = 0;
const MIN_GAP_MS = 10000;

function authorize(request) {
  const secret = process.env.KESHER_WEBHOOK_SECRET;
  if (!secret) return { error: NextResponse.json({ error: 'KESHER_WEBHOOK_SECRET לא מוגדר בשרת' }, { status: 500 }) };
  const token = new URL(request.url).searchParams.get('token');
  if (!safeEqual(token || '', secret)) return { error: NextResponse.json({ error: 'אין הרשאה' }, { status: 401 }) };
  return { ok: true };
}

const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

// GET - לבדיקת תקינות הכתובת והטוקן בדפדפן (לא מריץ סנכרון).
export async function GET(request) {
  const auth = authorize(request);
  if (auth.error) return auth.error;
  return NextResponse.json({ ok: true, message: 'וובהוק קשר פעיל' });
}

export async function POST(request) {
  const auth = authorize(request);
  if (auth.error) return auth.error;

  if (running || Date.now() - lastRunAt < MIN_GAP_MS) {
    return NextResponse.json({ skipped: true, reason: 'ריצת סנכרון קרובה כבר טופלה' });
  }
  running = true;
  try {
    const supabase = createAdminClient();
    // createNewContacts=false: ריצה מוובהוק לעולם לא יוצרת אנשי קשר חדשים
    // (כמה ריצות מקבילות היו עלולות ליצור כפילות) - יצירה נשארת ל-cron.
    // אימות תשלום של ליד לא צריך איש קשר חדש: המזהה האישי מצביע על ליד קיים.
    const result = await runKesherSyncCore(supabase, { id: null }, isoDay(-1), isoDay(1), false, 'webhook');
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({
      ok: true,
      transactionsCreated: result.transactionsCreated,
      transactionsSkipped: result.transactionsSkipped,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'שגיאה בסנכרון' }, { status: 500 });
  } finally {
    running = false;
    lastRunAt = Date.now();
  }
}
