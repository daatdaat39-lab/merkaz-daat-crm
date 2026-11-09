-- קישור קצר ללקוח (/r/<קוד>, /d/<קוד>, /p/<קוד>) במקום הכתובות הארוכות
-- (/register/<טוקן באורך 32> וקישור התשלום האישי של קשר באורך ~470 תווים).
-- הקוד פותר בשרת לאותו ליד (lead_conversion_checklist), ולכן ההודעה ללקוח
-- קצרה ולא חושפת שם, טלפון ומייל בכתובת. 10 תווים מ-31 סמלים (בלי תווים
-- דומים), ייחודי. אדיטיבי בלבד, בטוח להרצה חוזרת.

alter table public.lead_conversion_checklist
  add column if not exists short_code text;

create unique index if not exists lead_conversion_checklist_short_code_idx
  on public.lead_conversion_checklist(short_code)
  where short_code is not null;

-- Rollback (לא להריץ אלא אם צריך לבטל):
-- drop index if exists public.lead_conversion_checklist_short_code_idx;
-- alter table public.lead_conversion_checklist drop column if exists short_code;
