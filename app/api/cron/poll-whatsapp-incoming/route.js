import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { pullIncomingWhatsapp } from '../../../../lib/inforu/incomingMessages';
import { safeEqual } from '../../../../lib/security/safeEqual';

// שולף הודעות-WhatsApp-נכנסות דרך ה-Pull API של InforU (ר' lib/inforu/
// incomingMessages.js) - חלופה-עצמאית ל-Push-webhook (app/api/webhooks/
// inforu-whatsapp/route.js, שנשאר-קיים-במקביל-ללא-נזק - אם-Push-כן-
// יופעל-בעתיד, שתי-הדרכים-כותבות-לאותה-טבלה-בלי-להתנגש). אותה-לוגיקת-
// שיוך-לאיש-קשר/מחלקה בדיוק כמו ה-webhook.
function normalizePhone(p) {
  return (p || '').replace(/\D/g, '').slice(-9);
}

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
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  if (!items.length) return NextResponse.json({ success: true, processed: 0 });

  const { data: contacts } = await supabase.from('contacts').select('id, phone, phone2');
  const byPhone = new Map();
  for (const c of contacts || []) {
    if (c.phone) byPhone.set(normalizePhone(c.phone), c.id);
    if (c.phone2) byPhone.set(normalizePhone(c.phone2), c.id);
  }

  let processed = 0;
  for (const item of items) {
    if (!item.phone || !item.message) continue;

    const contactId = byPhone.get(normalizePhone(item.phone)) || null;
    let workspaceId = null;
    if (contactId) {
      const { data: lastOutbound } = await supabase
        .from('sent_whatsapp')
        .select('workspace_id')
        .eq('contact_id', contactId)
        .eq('direction', 'out')
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();
      workspaceId = lastOutbound?.workspace_id || null;
    }

    await supabase.from('sent_whatsapp').insert({
      contact_id: contactId,
      workspace_id: workspaceId,
      phone: item.phone,
      kind: 'chat',
      message: item.message,
      direction: 'in',
      channel: item.channel,
      sent_at: item.receivedAt || new Date().toISOString(),
    });
    processed++;
  }

  return NextResponse.json({ success: true, processed });
}
