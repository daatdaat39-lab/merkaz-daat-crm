-- ============================================================
-- Migration: תמיכה בהודעות צ'אט חופשיות ב-WhatsApp (בנוסף להודעת
-- התבנית הראשונה) - נשלחות רק בתוך 24 שעות מתשובת הלקוח האחרונה.
-- ============================================================

alter table public.sent_whatsapp
  add column if not exists kind text not null default 'template'
    check (kind in ('template', 'chat'));

alter table public.sent_whatsapp
  add column if not exists message text;
