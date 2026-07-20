-- ============================================================
-- Migration: מעקב פעילות בסיסי למשתמשים - "נראה לאחרונה" + כמה זמן
-- כל משתמש היה פעיל בכל יום (first_seen/last_seen), לדוח הניהולי.
-- ============================================================

alter table public.profiles add column if not exists last_seen_at timestamptz;

create table if not exists public.user_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.user_activity_days enable row level security;

drop policy if exists "user_activity_days_all_authenticated" on public.user_activity_days;
create policy "user_activity_days_all_authenticated"
  on public.user_activity_days for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
