'use server';

import { createClient } from '../../../lib/supabase/server';

// סימון הודעות נכנסות כנקראו (sent_whatsapp.read_at, migration 0183) - נקרא
// מ-WhatsappPendingClient בעת פתיחת המסך. מסמן רק הודעות נכנסות שעדיין לא
// סומנו, ועד 200 בקריאה - מזהים שמגיעים מהלקוח לא נסמכים עליהם מעבר לזה.
export async function markWhatsappRead(ids) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };

  const clean = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string').slice(0, 200);
  if (clean.length === 0) return { success: true };

  const { error } = await supabase
    .from('sent_whatsapp')
    .update({ read_at: new Date().toISOString() })
    .in('id', clean)
    .eq('direction', 'in')
    .is('read_at', null);
  if (error) return { error: error.message };
  return { success: true };
}
