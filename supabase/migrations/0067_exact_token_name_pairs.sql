-- RPC נוסף לצד find_similar_contact_name_pairs (מיגרציה 0066) - לא
-- מטושטש/טריגרם, אלא קיבוץ מדויק לפי רכיבי-מילים ממוינים. תופס מקרים
-- כמו first="יוסף" last="חיים ערד" מול first="ערד" last="יוסף חיים" -
-- אותן 3 מילים בדיוק, סדר שונה - שדמיון-טריגרם על המחרוזת השלמה לא
-- תמיד תופס בציון גבוה מספיק. זול לחישוב (בלי GIN/טריגרם), כמעט 0
-- false positive (אם יש בדיוק אותן מילים, כמעט תמיד אותו אדם).
create or replace function public.find_same_tokens_contact_pairs(max_pairs int default 1000)
returns table(id_a uuid, id_b uuid)
language sql
stable
as $$
  with tokenized as (
    select id,
      (select string_agg(t, ' ' order by t) from unnest(
        string_to_array(lower(trim(coalesce(first, '') || ' ' || coalesce(last, ''))), ' ')
      ) as t where t <> '') as token_key
    from contacts
  )
  select a.id, b.id
  from tokenized a
  join tokenized b on a.id < b.id and a.token_key = b.token_key and a.token_key <> ''
  limit max_pairs;
$$;

-- דחיית מועמד-זוג (כרטיס שאולי הוא שני אנשים, לא כפילות) - אותו רעיון
-- בדיוק כמו dismissed_duplicate_pairs (מיגרציה 0030), רק per-contact
-- ולא per-pair, כי זיהוי-הזוגות עצמו סורק כל איש קשר בנפרד.
create table if not exists public.dismissed_couple_candidates (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade unique,
  dismissed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.dismissed_couple_candidates enable row level security;
create policy "dismissed_couple_candidates_all_authenticated" on public.dismissed_couple_candidates for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
