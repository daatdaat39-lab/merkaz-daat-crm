-- ============================================================
-- Migration: תיעוד מיילים שנשלחו מתוך המערכת לאנשי קשר - מוצג בטאב
-- "פעילות" בכרטיס איש הקשר, בנוסף לכך שהם נראים בתיקיית "נשלח" ב-Gmail.
-- ============================================================

create table if not exists public.sent_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_address text not null,
  subject text not null,
  body text not null,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);

alter table public.sent_emails enable row level security;

drop policy if exists "sent_emails_all_authenticated" on public.sent_emails;
create policy "sent_emails_all_authenticated"
  on public.sent_emails for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
