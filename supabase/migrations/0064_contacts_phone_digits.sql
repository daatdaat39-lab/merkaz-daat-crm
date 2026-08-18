-- עמודות generated (מחושבות אוטומטית, לא צריך לכתוב אליהן) שמנרמלות
-- phone/phone2 לספרות בלבד - כדי ש-findExistingMatch יוכל להתאים טלפון
-- בין מקורות שמפרמטים אותו אחרת (למשל "מערכת עסקים" עם מקפים מול קשר
-- בלי מקפים) בלי לפספס התאמה אמיתית בשקט. אושר מריצה חיה: 8 כרטיסים
-- כפולים נוצרו בגלל זה בדיוק (השוואת מחרוזת מדויקת על phone).
alter table public.contacts
  add column if not exists phone_digits text generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored,
  add column if not exists phone2_digits text generated always as (regexp_replace(coalesce(phone2, ''), '\D', '', 'g')) stored;

create index if not exists contacts_phone_digits_idx on public.contacts (phone_digits) where phone_digits <> '';
create index if not exists contacts_phone2_digits_idx on public.contacts (phone2_digits) where phone2_digits <> '';
