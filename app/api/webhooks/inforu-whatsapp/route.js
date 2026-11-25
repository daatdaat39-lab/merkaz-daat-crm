import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { ingestIncomingWhatsapp } from '../../../../lib/whatsapp/ingestIncoming';
import { safeEqual } from '../../../../lib/security/safeEqual';

// נקודת קצה שאליה InforUMobile שולחים POST בכל פעם שמתקבלת הודעת
// WhatsApp נכנסת מלקוח ("Push Option", מוגדר מול התמיכה שלהם). מאובטח
// בטוקן בפרמטר ה-URL, כי InforU לא תומכים בכותרת Authorization מותאמת.
// הקליטה עצמה משותפת עם ה-cron - ר' lib/whatsapp/ingestIncoming.js.
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  if (!safeEqual(searchParams.get('token'), process.env.INFORU_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.Data) ? body.Data : [];
  if (!items.length) return NextResponse.json({ success: true, processed: 0 });

  try {
    const result = await ingestIncomingWhatsapp(createAdminClient(), 'push', items);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
