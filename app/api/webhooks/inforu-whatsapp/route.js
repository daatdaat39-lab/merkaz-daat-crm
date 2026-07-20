import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// נקודת קצה שאליה InforUMobile שולחים POST בכל פעם שמתקבלת הודעת
// WhatsApp נכנסת מלקוח (הוגדר ידנית מול צוות התמיכה שלהם - "Push
// Option"). מאובטח באמצעות טוקן בפרמטר ה-URL, כי InforU לא תומכים
// בהוספת כותרות Authorization מותאמות אישית לבקשת ה-webhook שלהם.
function normalizePhone(p) {
  return (p || '').replace(/\D/g, '').slice(-9);
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('token') !== process.env.INFORU_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const items = body?.Data || [];
  if (!items.length) return NextResponse.json({ success: true, processed: 0 });

  const supabase = createAdminClient();

  const { data: contacts } = await supabase.from('contacts').select('id, phone, phone2');
  const byPhone = new Map();
  for (const c of contacts || []) {
    if (c.phone) byPhone.set(normalizePhone(c.phone), c.id);
    if (c.phone2) byPhone.set(normalizePhone(c.phone2), c.id);
  }

  let processed = 0;
  for (const item of items) {
    const phone = item.PhoneNumber;
    const message = item.Message;
    if (!phone || !message) continue;

    const contactId = byPhone.get(normalizePhone(phone)) || null;
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
      phone,
      kind: 'chat',
      message,
      direction: 'in',
      channel: item.Channel || null,
    });
    processed++;
  }

  return NextResponse.json({ success: true, processed });
}
