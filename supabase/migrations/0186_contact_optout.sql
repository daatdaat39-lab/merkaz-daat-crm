-- ============================================================
-- 0186 - סימון "לא לפנות" לאיש קשר, לפי ערוץ (שלב 5ג בתוכנית).
-- עד היום לא הייתה במערכת שום דרך לסמן שלקוח ביקש להפסיק לקבל הודעות, והשליחה
-- (ידנית ואוטומטית) לא בדקה כלום. העמודות כאן מאפשרות לשער את השליחה בשרת
-- ולסמן ידנית מכרטיס איש הקשר. הערך ריק = מותר לפנות (אין שינוי בהתנהגות
-- הקיימת לאף איש קשר). אדיטיבי ואידמפוטנטי; rollback בסוף הקובץ.
-- ============================================================

alter table public.contacts
  add column if not exists email_optout_at timestamptz,
  add column if not exists whatsapp_optout_at timestamptz,
  -- מי סימן: 'agent' (נציג מהכרטיס) או 'customer_keyword' (הלקוח כתב "הסר" וכד')
  add column if not exists optout_source text,
  add column if not exists optout_note text;

-- ------------------------------------------------------------
-- rollback (רק אם צריך לבטל):
--   alter table public.contacts
--     drop column if exists optout_note, drop column if exists optout_source,
--     drop column if exists whatsapp_optout_at, drop column if exists email_optout_at;
-- ------------------------------------------------------------
