import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { safeEqual } from '../../../../lib/security/safeEqual';
import { getPipeline } from '../../../dashboard/lib/pipelines';
import { moveLeadStage } from '../../../dashboard/lib/leadStageRules';
import { STAGE_REGISTERED, STAGE_ACTIVE_STUDENT } from '../../../dashboard/lib/leadStageKeys';

// פעם ביום: לידים בשלב "נרשם" שתאריך תחילת הקורס שלהם הגיע עוברים אוטומטית
// ל"תלמיד פעיל". לכל מסלול תאריכים משלו, לכן התאריך נלקח מהמסלול שנבחר
// (course_tracks.start_date, migration 0189) ובהיעדרו מההרשמה עצמה
// (course_purchases.enrollment_start_date). בלי תאריך - הליד נשאר "נרשם"
// (המעבר הידני תמיד אפשרי). חל רק על מחלקות sells_courses.
// ?dryRun=1 - מחזיר מה היה עובר בלי לשנות כלום. אותו דפוס אימות כמו
// /api/cron/check-paused-donations.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// התאריך של "היום" לפי שעון ישראל (yyyy-mm-dd), לא לפי UTC.
function todayInJerusalem() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

export async function GET(request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'CRON_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (!safeEqual(authHeader, `Bearer ${configuredSecret}`)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const supabase = createAdminClient();
  const today = todayInJerusalem();
  const result = { today, dryRun, moved: 0, wouldMove: [], waitingForDate: 0, noDate: 0 };

  const { data: workspaces } = await supabase.from('workspaces').select('id, name').eq('sells_courses', true);
  for (const ws of workspaces || []) {
    const pipeline = await getPipeline(supabase, ws.name);
    if (!pipeline.order.includes(STAGE_REGISTERED) || !pipeline.order.includes(STAGE_ACTIVE_STUDENT)) continue;

    const { data: rows } = await supabase
      .from('contact_departments')
      .select('id, contact_id, workspace_id, stage')
      .eq('workspace_id', ws.id).eq('stage', STAGE_REGISTERED);
    if (!rows?.length) continue;
    const ids = rows.map((r) => r.id);

    const [{ data: checklists }, { data: purchases }] = await Promise.all([
      supabase.from('lead_conversion_checklist')
        .select('contact_department_id, course_tracks:track_id (start_date)').in('contact_department_id', ids),
      supabase.from('course_purchases')
        .select('contact_department_id, enrollment_start_date').in('contact_department_id', ids).neq('status', 'cancelled'),
    ]);
    const trackStart = new Map((checklists || []).map((c) => [c.contact_department_id, c.course_tracks?.start_date || null]));
    const purchaseStart = new Map((purchases || []).map((p) => [p.contact_department_id, p.enrollment_start_date || null]));

    for (const row of rows) {
      const start = trackStart.get(row.id) || purchaseStart.get(row.id) || null;
      if (!start) { result.noDate++; continue; }
      if (start > today) { result.waitingForDate++; continue; }
      if (dryRun) { result.wouldMove.push({ id: row.id, startDate: start }); continue; }
      if (await moveLeadStage(supabase, row, STAGE_ACTIVE_STUDENT, null)) result.moved++;
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
