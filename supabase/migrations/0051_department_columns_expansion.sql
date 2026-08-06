-- הרחבת סכימה לפי מיפוי שלושה קבצי מקור (תרומות, מערכת אורביט - דעת
-- ותבונה, דעת למדני): כתובת כעמודת בסיס משותפת לכל מחלקה (עלתה כנתון
-- אמיתי בשלושת הקבצים), ועמודות ברמת תנועה/התחייבות בודדת שלא שייכות
-- לאיש הקשר עצמו (יכולות להשתנות מתרומה לתרומה של אותו אדם).

alter table public.contacts
  add column if not exists city text,
  add column if not exists street text,
  add column if not exists house_number text,
  add column if not exists apartment text,
  add column if not exists zip_code text,
  add column if not exists neighborhood text,
  add column if not exists country text;

alter table public.donation_transactions
  add column if not exists designation text,
  add column if not exists payment_method text,
  add column if not exists transaction_type text,
  add column if not exists campaign_reference text,
  add column if not exists fundraiser_name text;

alter table public.commitments
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists frequency text,
  add column if not exists bounced_count int not null default 0,
  add column if not exists external_reference text;
