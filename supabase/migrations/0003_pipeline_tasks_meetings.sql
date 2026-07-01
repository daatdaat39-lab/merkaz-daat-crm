-- ============================================================
-- Migration: Pipeline (stage/source), Tasks, Meetings + demo data
-- ============================================================

-- 1) new columns on contacts: pipeline stage, lead source, assigned agent
alter table public.contacts
  add column if not exists stage text not null default 'open'
    check (stage in ('open','meeting','process','registered','closed'));

alter table public.contacts
  add column if not exists source text;

alter table public.contacts
  add column if not exists agent_id uuid references public.profiles(id) on delete set null;

alter table public.contacts
  add column if not exists notes text;

-- 2) meetings table
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  title text,
  meeting_date date not null,
  meeting_time time not null,
  type text not null default U&'\05E4\05E8\05D5\05E0\05D8\05DC\05D9',
  location text,
  agent_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- 3) tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  done boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS on the new tables
-- ============================================================
alter table public.meetings enable row level security;
alter table public.tasks enable row level security;
alter table public.contacts enable row level security;

drop policy if exists "meetings_all_workspace_member" on public.meetings;
create policy "meetings_all_workspace_member"
  on public.meetings for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

drop policy if exists "tasks_all_workspace_member" on public.tasks;
create policy "tasks_all_workspace_member"
  on public.tasks for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

-- add insert/update/delete access to contacts (select policy already exists)
drop policy if exists "contacts_modify_workspace_member" on public.contacts;
create policy "contacts_modify_workspace_member"
  on public.contacts for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

-- ============================================================
-- demo data - only if not already seeded (prevents duplicates on re-run)
-- ============================================================
do $$
declare
  ws_id uuid;
  demo_agent uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid;
begin
  select id into ws_id from public.workspaces order by created_at asc limit 1;
  select id into demo_agent from public.profiles limit 1;

  -- clean up any previously-seeded demo data (e.g. from a corrupted paste)
  -- before re-seeding, so this block is safe to re-run
  if ws_id is not null then
    delete from public.tasks where workspace_id = ws_id;
    delete from public.meetings where workspace_id = ws_id;
    delete from public.contacts where email like 'demo-lead-%@example.com';
  end if;

  if ws_id is not null then

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05D0\05D5\05E8\05D9',U&'\05E9\05DC\05D5\05DD','052-1000001','demo-lead-1@example.com',U&'\05DC\05D9\05DE\05D5\05D3\05D9',U&'{\05D7\05D3\05E9}',ws_id,'open',U&'\05D0\05EA\05E8',demo_agent, now() - interval '1 day')
    returning id into c1;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05D2\05DC',U&'\05D1\05E8\05E7','052-1000002','demo-lead-2@example.com',U&'\05EA\05E8\05D5\05DE\05D5\05EA','{VIP}',ws_id,'meeting',U&'\05D4\05DE\05DC\05E6\05D4',demo_agent, now() - interval '2 day')
    returning id into c2;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05EA\05DE\05E8',U&'\05DC\05D5\05D9','052-1000003','demo-lead-3@example.com',U&'\05DC\05D9\05DE\05D5\05D3\05D9',U&'{\05D7\05D5\05D6\05E8}',ws_id,'process',U&'\05E4\05D9\05D9\05E1\05D1\05D5\05E7',demo_agent, now() - interval '4 day')
    returning id into c3;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05D0\05D9\05EA\05DE\05E8',U&'\05DB\05D4\05DF','052-1000004','demo-lead-4@example.com',U&'\05EA\05E8\05D5\05DE\05D5\05EA',U&'{\05EA\05E8\05D5\05DE\05D4 \05D2\05D3\05D5\05DC\05D4}',ws_id,'registered',U&'\05D0\05EA\05E8',demo_agent, now() - interval '6 day')
    returning id into c4;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05E0\05D5\05E2\05D4',U&'\05D0\05D1\05E8\05D4\05DD','052-1000005','demo-lead-5@example.com',U&'\05DC\05D9\05DE\05D5\05D3\05D9',U&'{\05D7\05D3\05E9}',ws_id,'open',U&'\05D4\05DE\05DC\05E6\05D4',demo_agent, now() - interval '1 day')
    returning id into c5;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05E8\05D5\05DF',U&'\05DE\05D6\05E8\05D7\05D9','050-1000006','demo-lead-6@example.com',U&'\05DC\05D9\05DE\05D5\05D3\05D9','{}',ws_id,'meeting',U&'\05D0\05EA\05E8',demo_agent, now() - interval '3 day')
    returning id into c6;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05D3\05E0\05D4',U&'\05E4\05E8\05E5','050-1000007','demo-lead-7@example.com',U&'\05EA\05E8\05D5\05DE\05D5\05EA','{VIP}',ws_id,'closed',U&'\05D0\05EA\05E8',demo_agent, now() - interval '10 day')
    returning id into c7;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values (U&'\05D9\05D5\05D1\05DC',U&'\05D2\05D5\05DC\05DF','050-1000008','demo-lead-8@example.com',U&'\05DC\05D9\05DE\05D5\05D3\05D9',U&'{\05D7\05D5\05D6\05E8}',ws_id,'process',U&'\05E4\05D9\05D9\05E1\05D1\05D5\05E7',demo_agent, now() - interval '5 day')
    returning id into c8;

    -- demo meetings
    insert into public.meetings (workspace_id, contact_id, title, meeting_date, meeting_time, type, location, agent_id, notes)
    values
      (ws_id, c2, U&'\05E4\05D2\05D9\05E9\05EA \05D4\05D9\05DB\05E8\05D5\05EA', current_date + 1, '10:00', U&'\05E4\05E8\05D5\05E0\05D8\05DC\05D9', U&'\05DE\05E9\05E8\05D3 \05E8\05D0\05E9\05D9', demo_agent, U&'\05DC\05D4\05D1\05D9\05D0 \05D7\05D5\05D1\05E8\05EA \05DE\05D9\05D3\05E2'),
      (ws_id, c6, U&'\05E8\05D0\05D9\05D5\05DF \05D0\05D9\05E9\05D9', current_date + 2, '13:30', U&'\05D8\05DC\05E4\05D5\05E0\05D9', null, demo_agent, null),
      (ws_id, c3, U&'\05E9\05D9\05D7\05EA \05D4\05DE\05E9\05DA', current_date - 1, '09:00', U&'\05E4\05E8\05D5\05E0\05D8\05DC\05D9', U&'\05DE\05E9\05E8\05D3 \05E8\05D0\05E9\05D9', demo_agent, U&'\05D4\05EA\05E7\05D9\05D9\05DE\05D4 \05D1\05D4\05E6\05DC\05D7\05D4');

    -- demo tasks
    insert into public.tasks (workspace_id, contact_id, title, description, due_date, done, assigned_to)
    values
      (ws_id, c1, U&'\05DC\05D4\05EA\05E7\05E9\05E8 \05D5\05DC\05EA\05D0\05DD \05E4\05D2\05D9\05E9\05D4', U&'\05DC\05D9\05D3 \05D7\05D3\05E9 \05DE\05D4\05D0\05EA\05E8', current_date, false, demo_agent),
      (ws_id, c2, U&'\05DC\05E9\05DC\05D5\05D7 \05EA\05D6\05DB\05D5\05E8\05EA \05DC\05E4\05D2\05D9\05E9\05D4 \05DE\05D7\05E8', null, current_date, false, demo_agent),
      (ws_id, c4, U&'\05DC\05D5\05D5\05D3\05D0 \05E7\05D1\05DC\05EA \05EA\05E9\05DC\05D5\05DD \05EA\05E8\05D5\05DE\05D4', null, current_date + 1, false, demo_agent),
      (ws_id, null, U&'\05DC\05E2\05D3\05DB\05DF \05D7\05D5\05D1\05E8\05EA \05DE\05D9\05D3\05E2 \05DC\05DC\05D9\05D3 \05D7\05D3\05E9\05D9\05DD', U&'\05DE\05E9\05D9\05DE\05D4 \05DB\05DC\05DC\05D9\05EA', current_date + 3, false, demo_agent),
      (ws_id, c7, U&'\05DC\05E1\05D2\05D5\05E8 \05EA\05D9\05E7 - \05DC\05D9\05D3 \05DC\05D0 \05DE\05DE\05E9\05D9\05DA', null, current_date - 2, true, demo_agent);

  end if;
end $$;
