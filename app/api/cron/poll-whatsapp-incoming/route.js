import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { pullIncomingWhatsapp } from '../../../../lib/inforu/incomingMessages';
import { ingestIncomingWhatsapp, recordIntegrationHealth } from '../../../../lib/whatsapp/ingestIncoming';
import { safeEqual } from '../../../../lib/security/safeEqual';

// שולף הודעות-WhatsApp-נכנסות דרך ה-Pull API של InforU (ר' lib/inforu/
// incomingMessages.js) כל 5 דקות (vercel.json). הקליטה עצמה - שמירה
// גולמית, זיהוי שולח, שיוך לליד ולשיחה - ב-lib/whatsapp/ingestIncoming.js,
// משותפת עם ה-Push webhook. כל ריצה מעדכנת את integration_health, כדי
// שמסך הוואטסאפ יוכל להתריע כשהודעות מפסיקות להיכנס.
const HEALTH_KEY = 'whatsapp_pull';

export async function GET(request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'CRON_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  if (!safeEqual(request.headers.get('authorization'), `Bearer ${configuredSecret}`)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  const supabase = createAdminClient();

  let items;
  try {
    items = await pullIncomingWhatsapp();
  } catch (err) {
    await recordIntegrationHealth(supabase, HEALTH_KEY, err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  try {
    // גם כשאין הודעות חדשות - מעבדים שורות שנכשלו בריצה קודמת
    const result = await ingestIncomingWhatsapp(supabase, 'pull', items);
    await recordIntegrationHealth(supabase, HEALTH_KEY);
    return NextResponse.json({ success: true, pulled: items.length, ...result });
  } catch (err) {
    await recordIntegrationHealth(supabase, HEALTH_KEY, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
