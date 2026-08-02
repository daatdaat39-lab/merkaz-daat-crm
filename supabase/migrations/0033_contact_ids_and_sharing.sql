-- מספר לקוח רץ - מזהה יחודי קריא לבני-אדם (בנוסף ל-uuid הפנימי) שמזהה
-- כל איש קשר במערכת. bigserial מתמלא אוטומטית גם לשורות קיימות (לא רק
-- לחדשות) כי ברירת המחדל (nextval) אינה קבועה ומחושבת פר-שורה.
alter table public.contacts
  add column if not exists contact_number bigserial;
create unique index if not exists contacts_contact_number_idx on public.contacts(contact_number);

-- מזהה של איש הקשר בכל מערכת חיצונית שממנה הוא הגיע (קשר/יעד/וכו') -
-- טבלה נפרדת כי אותו איש קשר יכול להגיע/להיות מיובא מכמה מערכות שונות
-- לאורך זמן, ורוצים לזכור את המזהה שלו בכל אחת מהן (שימושי להתאמת
-- ייבוא עתידי לפי אותו מזהה, לא רק לפי טלפון/מייל/ת"ז).
create table if not exists public.contact_external_ids (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (source_system, external_id)
);
create index if not exists contact_external_ids_contact_idx on public.contact_external_ids(contact_id);

alter table public.contact_external_ids enable row level security;
drop policy if exists "contact_external_ids_all_authenticated" on public.contact_external_ids;
create policy "contact_external_ids_all_authenticated" on public.contact_external_ids for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- שיתוף איש קשר בין נציגים - הודעת טקסט חופשי שנציג אחד שולח לנציג אחר
-- על איש קשר ספציפי, ומופיעה אצל המקבל כ"הודעה חדשה" (read_at null = טרם נקראה)
create table if not exists public.contact_shares (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  from_user uuid references auth.users(id) on delete set null,
  to_user uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists contact_shares_to_user_idx on public.contact_shares(to_user, read_at);
create index if not exists contact_shares_contact_idx on public.contact_shares(contact_id);

alter table public.contact_shares enable row level security;
drop policy if exists "contact_shares_all_authenticated" on public.contact_shares;
create policy "contact_shares_all_authenticated" on public.contact_shares for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
