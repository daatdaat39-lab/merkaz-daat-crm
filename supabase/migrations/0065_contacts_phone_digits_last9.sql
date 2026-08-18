-- מחליף את phone_digits/phone2_digits (מיגרציה 0064, שהשוותה את כל
-- הספרות) ב"9 ספרות אחרונות בלבד" - אותה שיטת נירמול שכבר קיימת
-- ומוכחת בקוד (lib/hallo015/config.js normalizePhone,
-- app/dashboard/contacts/phoneRouting.js normalizePhoneDigits) - כדי
-- שגם "0501234567" (מקומי), "972501234567"/"+972501234567"
-- (בינלאומי), וגם "0+972501234567" (באג תיעוד שנצפה בפועל בקשר - "0"
-- מיותר שנוסף בטעות לפני קידומת בינלאומית קיימת) יתנרמלו לאותה מחרוזת.
-- אושר מריצה חיה: שני כרטיסים כפולים ("מנחם מוריס") נוצרו כי הטלפון
-- שקשר החזירה בשתי קריאות API שונות (GetObligations מול GetTrans) לא
-- היה זהה כמחרוזת ספרות מלאה, למרות שזה אותו מספר בפועל.
alter table public.contacts drop column if exists phone_digits;
alter table public.contacts drop column if exists phone2_digits;
alter table public.contacts
  add column phone_digits text generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)) stored,
  add column phone2_digits text generated always as (right(regexp_replace(coalesce(phone2, ''), '\D', '', 'g'), 9)) stored;

create index if not exists contacts_phone_digits_idx on public.contacts (phone_digits) where phone_digits <> '';
create index if not exists contacts_phone2_digits_idx on public.contacts (phone2_digits) where phone2_digits <> '';
