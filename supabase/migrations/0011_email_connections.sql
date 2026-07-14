-- ============================================================
-- Migration: חיבור תיבות Gmail למחלקות - כל שורה היא תיבת מייל אחת
-- שמחוברת (דרך OAuth של Google) למחלקה מסוימת. refresh_token מאפשר
-- לשרת לגשת לתיבה בלי שהמשתמש יצטרך להתחבר מחדש כל פעם.
-- ============================================================

create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_address text not null unique,
  refresh_token text not null,
  last_checked_at timestamptz,
  last_history_id text,
  created_at timestamptz not null default now()
);

alter table public.email_connections enable row level security;

drop policy if exists "email_connections_all_authenticated" on public.email_connections;
create policy "email_connections_all_authenticated"
  on public.email_connections for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
