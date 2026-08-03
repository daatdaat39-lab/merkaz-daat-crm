import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// בודק פעם ביום הוראות תרומה שהוקפאו זמנית (extra_fields.donation_paused +
// paused_until) - כשתאריך היעד מגיע, יוצר משימת פולו-אפ לנציג המטפל
// ומנקה את דגל ההקפאה (כדי שהתיק לא יישאר "מוקפא" לצמיתות). אותו דפוס
// אימות בדיוק כמו /api/cron/poll-emails.
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
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from('contact_departments')
    .select('id, contact_id, agent_id, workspace_id, extra_fields, contacts:contact_id (first, last)')
    .eq('extra_fields->>donation_paused', 'true');

  let woken = 0;
  for (const row of rows || []) {
    const pausedUntil = row.extra_fields?.paused_until;
    if (!pausedUntil || pausedUntil > todayStr) continue;

    const name = `${row.contacts?.first || ''} ${row.contacts?.last || ''}`.trim() || 'איש קשר';
    await supabase.from('tasks').insert({
      title: `תרומה של ${name} חזרה מהקפאה - לחדש קשר`,
      contact_id: row.contact_id,
      workspace_id: row.workspace_id,
      assigned_to: row.agent_id || null,
      due_date: todayStr,
    });

    const { donation_paused, paused_until, ...rest } = row.extra_fields || {};
    await supabase.from('contact_departments').update({ extra_fields: rest }).eq('id', row.id);
    woken++;
  }

  return NextResponse.json({ success: true, woken });
}
