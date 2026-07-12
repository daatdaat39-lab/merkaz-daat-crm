-- ============================================================
-- Migration: איש קשר יכול להיות פעיל בכמה מחלקות בו-זמנית
-- כל מחלקה עם שלב (pipeline) משלה, בדיוק כמו workspace_members למשתמשים.
-- ============================================================

create table if not exists public.contact_departments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage text not null,
  closed_reason text,
  agent_id uuid references auth.users(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contact_id, workspace_id)
);

alter table public.contact_departments enable row level security;

drop policy if exists "contact_departments_all_authenticated" on public.contact_departments;
create policy "contact_departments_all_authenticated"
  on public.contact_departments for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

-- מעביר את כל אנשי הקשר הקיימים (מחלקה+שלב יחיד) לשורה אחת בטבלה החדשה
insert into public.contact_departments (contact_id, workspace_id, stage, closed_reason, agent_id, last_activity_at, created_at)
select id, workspace_id, stage, closed_reason, agent_id, last_activity_at, created_at
from public.contacts
where workspace_id is not null
on conflict (contact_id, workspace_id) do nothing;
