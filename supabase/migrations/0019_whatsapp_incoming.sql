-- ============================================================
-- Migration: תמיכה בהודעות WhatsApp נכנסות (מהלקוח) - נרשמות באותה
-- טבלה כמו הודעות יוצאות, עם כיוון (direction). contact_id/workspace_id
-- הופכים לא-חובה כי הודעה נכנסת עשויה להגיע ממספר שלא משויך לאף איש
-- קשר קיים במערכת.
-- ============================================================

alter table public.sent_whatsapp alter column contact_id drop not null;
alter table public.sent_whatsapp alter column workspace_id drop not null;

alter table public.sent_whatsapp
  add column if not exists direction text not null default 'out'
    check (direction in ('in', 'out'));

alter table public.sent_whatsapp
  add column if not exists channel text;
