-- מספרי טלפון נוספים מעבר לשני שדות phone/phone2 הרגילים על contacts -
-- לתמיכה בקבצי ייבוא עם יותר מ-2 עמודות טלפון (למשל "מערכת עסקים": טלפון
-- בית/נייד/נייד נוסף/עסק). מבנה זהה במכוון ל-contact_external_ids
-- (מיגרציה 0033) - טבלת ילד פשוטה, בלי workspace_id (טלפון שייך לאיש
-- הקשר עצמו, לא למחלקה ספציפית). לא נבדק היום ע"י שום התאמת שיחה/וואטסאפ
-- נכנסת (hallo015-call, inforu-whatsapp webhooks) - בכוונה; רק אשף
-- הייבוא (findExistingMatch) קורא ממנה.
create table if not exists public.contact_phones (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  phone text not null,
  label text,
  source text,
  created_at timestamptz not null default now()
);

-- לא-חלקי בכוונה (שתי עמודות NOT NULL) - רשת ביטחון מפני הכנסה כפולה
-- ממש (upsert עם ignoreDuplicates), לא הדדופ העיקרי. הדדופ העיקרי (התאמת
-- מספרים בפורמטים שונים - עם/בלי מקפים) נעשה באפליקציה (phoneRouting.js)
-- לפני ההכנסה, לא כאן.
create unique index if not exists contact_phones_contact_phone_uniq
  on public.contact_phones (contact_id, phone);
create index if not exists contact_phones_contact_idx on public.contact_phones(contact_id);

alter table public.contact_phones enable row level security;

drop policy if exists "contact_phones_all_authenticated" on public.contact_phones;
create policy "contact_phones_all_authenticated"
  on public.contact_phones for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
