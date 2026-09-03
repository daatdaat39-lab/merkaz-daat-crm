import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { runKesherSyncCore } from '../../../dashboard/contacts/kesherSyncCore';

// "השעון" של סנכרון קשר - מופעל תדיר (כל 5 דקות, ר' .github/workflows/
// sync-kesher.yml) אבל בפועל מריץ סנכרון אמיתי רק אם עבר מספיק זמן לפי
// kesher_sync_settings (שורה יחידה, נשלטת מהמסך "ייבוא נתונים" ← "סנכרון
// אוטומטי") - כך שקצב ההרצה בפועל נקבע ע"י המנהל בלי דיפלוי חדש, בלי
// לגעת בתזמון של ה-workflow עצמו. אם ההגדרה כבויה או שעדיין לא עבר
// מספיק זמן - מחזיר "דולג" ולא נוגע בכלום.
export async function GET(request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'CRON_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from('kesher_sync_settings').select('interval_minutes, enabled').eq('id', true).maybeSingle();
  if (!settings?.enabled) {
    return NextResponse.json({ skipped: true, reason: 'סנכרון אוטומטי כבוי בהגדרות' });
  }

  const { data: lastRun } = await supabase
    .from('kesher_sync_runs').select('run_at, to_date').order('run_at', { ascending: false }).limit(1).maybeSingle();
  const intervalMs = (settings.interval_minutes || 1440) * 60000;
  if (lastRun && Date.now() - new Date(lastRun.run_at).getTime() < intervalMs) {
    return NextResponse.json({ skipped: true, reason: 'עדיין לא עבר מספיק זמן מהריצה האחרונה' });
  }

  const fromDate = lastRun?.to_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  // שואלים את קשר עד 14 יום קדימה, לא רק "עד היום" - אומת בפועל: הוראת-
  // קבע חדשה עם start_date יומיים-קדימה לא הוחזרה כשה-toDate היה "היום"
  // בלבד, ורק כשהורחב קדימה כן הופיעה (ר' הערה ב-kesherSyncCore.js).
  // bookkeepingToDate נשאר "היום" האמיתי כדי שה-fromDate של הריצה הבאה
  // ימשיך להתקדם לפי זמן-אמת, לא "יקפוץ" לתאריך-העתיד ששאלנו עליו כאן.
  const queryToDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const result = await runKesherSyncCore(supabase, { id: null }, fromDate, queryToDate, true, 'cron', today);
  return NextResponse.json({ fromDate, toDate: queryToDate, ...result });
}
