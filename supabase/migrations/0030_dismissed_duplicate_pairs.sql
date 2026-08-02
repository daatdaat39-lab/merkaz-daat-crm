-- ============================================================
-- Migration: זיכרון "לא כפילות" עבור תור בדיקת הכפליות (הגדרות ←
-- בדיקת כפליות) - זוג אנשי קשר שסומן ידנית כלא-כפילות לא יוצע שוב.
-- contact_id_a תמיד ה-uuid הקטן מבין השניים (מנורמל בקוד), כדי שה-
-- unique יעבוד בלי תלות בסדר שבו הזוג הוצג.
-- ============================================================

create table if not exists public.dismissed_duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  contact_id_a uuid not null references public.contacts(id) on delete cascade,
  contact_id_b uuid not null references public.contacts(id) on delete cascade,
  dismissed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contact_id_a, contact_id_b)
);

alter table public.dismissed_duplicate_pairs enable row level security;

drop policy if exists "dismissed_duplicate_pairs_all_authenticated" on public.dismissed_duplicate_pairs;
create policy "dismissed_duplicate_pairs_all_authenticated"
  on public.dismissed_duplicate_pairs for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
