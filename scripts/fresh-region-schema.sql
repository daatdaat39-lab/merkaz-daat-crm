-- ================= 0000_bootstrap_baseline (not a real tracked migration -
-- profiles/contacts predate this repo's migration history on the old
-- project; reconstructed here purely so a brand-new empty project has
-- something for 0001+ to ALTER TABLE against) =================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text default 'user',
  level text default 'rep',
  dept text
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_all_authenticated" on public.profiles;
create policy "profiles_all_authenticated"
  on public.profiles for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first text,
  last text not null default '',
  phone text,
  email text,
  dept text,
  tags text[] default '{}',
  idnum text,
  created_at timestamptz not null default now()
);

-- ================= 0001_workspaces.sql =================
-- ============================================================
-- Migration: Workspaces system
-- מוסיף: טבלת workspaces, טבלת workspace_members,
--        עמודת workspace_id ל-contacts, ועמודת current_workspace_id ל-profiles
-- ============================================================

-- 1) טבלת workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2) טבלת workspace_members (מי שייך לאיזה workspace, ובאיזה תפקיד)
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- 3) עמודת workspace_id בטבלת contacts הקיימת
alter table public.contacts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- 4) עמודת current_workspace_id ב-profiles (איזה workspace פתוח כרגע בסיידבר)
alter table public.profiles
  add column if not exists current_workspace_id uuid references public.workspaces(id) on delete set null;

-- ============================================================
-- מיגרציה של נתונים קיימים: יוצר workspace ברירת מחדל,
-- מעביר אליו את כל ה-contacts הקיימים, ומוסיף את כל המשתמשים כ-owner
-- ============================================================
do $$
declare
  default_ws_id uuid;
begin
  -- יוצר workspace ברירת מחדל רק אם עדיין אין אף workspace
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name)
    values ('מרכז דעת — ראשי')
    returning id into default_ws_id;

    -- מעביר את כל ה-contacts הקיימים (ללא workspace) לתוך ברירת המחדל
    update public.contacts
    set workspace_id = default_ws_id
    where workspace_id is null;

    -- מוסיף את כל המשתמשים הקיימים כ-owner ב-workspace ברירת המחדל
    insert into public.workspace_members (workspace_id, user_id, role)
    select default_ws_id, id, 'owner'
    from auth.users
    on conflict (workspace_id, user_id) do nothing;

    -- מגדיר לכל המשתמשים את ברירת המחדל כ-workspace הנוכחי שלהם
    update public.profiles
    set current_workspace_id = default_ws_id
    where current_workspace_id is null;
  end if;
end $$;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- workspaces: משתמש רואה רק workspaces שהוא חבר בהם
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

-- workspaces: יצירת workspace חדש - כל משתמש מחובר יכול
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (auth.uid() is not null);

-- workspace_members: משתמש רואה את החברים ב-workspaces שהוא עצמו חבר בהם
drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members wm2
      where wm2.workspace_id = workspace_members.workspace_id
        and wm2.user_id = auth.uid()
    )
  );

-- workspace_members: רק owner/admin יכולים להוסיף חברים
drop policy if exists "workspace_members_insert_admin" on public.workspace_members;
create policy "workspace_members_insert_admin"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspace_members wm3
      where wm3.workspace_id = workspace_members.workspace_id
        and wm3.user_id = auth.uid()
        and wm3.role in ('owner', 'admin')
    )
  );

-- ⚠️ חשוב: יש לעדכן גם את מדיניות ה-RLS הקיימת על contacts כך שתסנן לפי workspace_id.
-- זה תלוי במדיניות שכבר הוגדרה אצלכם, ולכן לא נגעתי בה אוטומטית.
-- דוגמה כללית לאיך זה אמור להיראות (יש להתאים לשם המדיניות הקיימת):
--
-- drop policy if exists "contacts_select_policy" on public.contacts;
-- create policy "contacts_select_policy"
--   on public.contacts for select
--   using (
--     exists (
--       select 1 from public.workspace_members wm
--       where wm.workspace_id = contacts.workspace_id
--         and wm.user_id = auth.uid()
--     )
--   );


-- ================= 0002_fix_workspace_rls.sql =================
-- ============================================================
-- Migration: תיקון בעיית recursion ב-RLS של workspace_members
-- ============================================================

-- פונקציית עזר שבודקת חברות ב-workspace בלי לגרום ל-recursion
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
  );
$$;

-- פונקציית עזר דומה, לבדיקת הרשאת owner/admin (לשימוש עתידי)
create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- מחליפים את ה-policies הבעייתיות לשימוש בפונקציות החדשות
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select
  using ( public.is_workspace_member(id) );

drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using ( public.is_workspace_member(workspace_id) );

drop policy if exists "workspace_members_insert_admin" on public.workspace_members;
create policy "workspace_members_insert_admin"
  on public.workspace_members for insert
  with check ( public.is_workspace_admin(workspace_id) );


-- ================= 0003_pipeline_tasks_meetings.sql =================
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


-- ================= 0004_department_workspaces.sql =================
-- ============================================================
-- Migration: Department workspaces (Daat Lamdani / Daat VeTvuna / Trumot)
-- ============================================================

do $$
declare
  main_ws_id uuid;
  ws_lamdani uuid;
  ws_tvuna uuid;
  ws_trumot uuid;
  super_admin_id uuid;
begin
  -- id of the existing main workspace
  select id into main_ws_id from public.workspaces order by created_at asc limit 1;

  -- create the 3 department workspaces if not already present
  if not exists (select 1 from public.workspaces where name = U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9') then
    insert into public.workspaces (name, created_by) values (U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9', null) returning id into ws_lamdani;
  else
    select id into ws_lamdani from public.workspaces where name = U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9';
  end if;

  if not exists (select 1 from public.workspaces where name = U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4') then
    insert into public.workspaces (name, created_by) values (U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4', null) returning id into ws_tvuna;
  else
    select id into ws_tvuna from public.workspaces where name = U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4';
  end if;

  if not exists (select 1 from public.workspaces where name = U&'\05EA\05E8\05D5\05DE\05D5\05EA') then
    insert into public.workspaces (name, created_by) values (U&'\05EA\05E8\05D5\05DE\05D5\05EA', null) returning id into ws_trumot;
  else
    select id into ws_trumot from public.workspaces where name = U&'\05EA\05E8\05D5\05DE\05D5\05EA';
  end if;

  -- move existing contacts (from main workspace) to the matching department by dept field
  update public.contacts
  set workspace_id = ws_lamdani
  where workspace_id = main_ws_id
    and (dept ilike U&'%\05DC\05DE\05D3\05E0\05D9%' or dept ilike U&'%\05DC\05D9\05DE\05D5\05D3%');

  update public.contacts
  set workspace_id = ws_tvuna
  where workspace_id = main_ws_id
    and dept ilike U&'%\05EA\05D1\05D5\05E0\05D4%';

  update public.contacts
  set workspace_id = ws_trumot
  where workspace_id = main_ws_id
    and dept ilike U&'%\05EA\05E8\05D5\05DE%';

  -- anything still left in the main workspace (unrecognized dept) -
  -- defaults to Daat Lamdani, needs manual admin review later
  update public.contacts
  set workspace_id = ws_lamdani
  where workspace_id = main_ws_id;

  -- sync meetings/tasks to the same workspace_id as their linked contact
  update public.meetings m
  set workspace_id = c.workspace_id
  from public.contacts c
  where m.contact_id = c.id
    and m.workspace_id != c.workspace_id;

  update public.tasks t
  set workspace_id = c.workspace_id
  from public.contacts c
  where t.contact_id = c.id
    and t.workspace_id != c.workspace_id;

  -- assign every user with a matching dept as owner of that department workspace
  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_lamdani, id, 'owner' from public.profiles
  where dept ilike U&'%\05DC\05DE\05D3\05E0\05D9%' or dept ilike U&'%\05DC\05D9\05DE\05D5\05D3%'
  on conflict (workspace_id, user_id) do update set role = 'owner';

  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_tvuna, id, 'owner' from public.profiles
  where dept ilike U&'%\05EA\05D1\05D5\05E0\05D4%'
  on conflict (workspace_id, user_id) do update set role = 'owner';

  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_trumot, id, 'owner' from public.profiles
  where dept ilike U&'%\05EA\05E8\05D5\05DE%'
  on conflict (workspace_id, user_id) do update set role = 'owner';

  -- the primary super-admin (first owner of the main workspace) gets owner in all 4 workspaces
  select user_id into super_admin_id
  from public.workspace_members
  where workspace_id = main_ws_id and role = 'owner'
  order by created_at asc
  limit 1;

  if super_admin_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values
      (ws_lamdani, super_admin_id, 'owner'),
      (ws_tvuna, super_admin_id, 'owner'),
      (ws_trumot, super_admin_id, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';
  end if;
end $$;


-- ================= 0005_fix_dana_access.sql =================
-- Fix: grant the actual CEO user (ceo@test.com) owner access to all department workspaces

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'owner'
from public.workspaces w
cross join auth.users u
where u.email = 'ceo@test.com'
  and w.name in (
    U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9',
    U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4',
    U&'\05EA\05E8\05D5\05DE\05D5\05EA'
  )
on conflict (workspace_id, user_id) do update set role = 'owner';


-- ================= 0006_contacts_visible_to_all.sql =================
-- ============================================================
-- Migration: אנשי קשר משותפים לכולם
-- כל משתמש מחובר יכול לראות ולערוך כל איש קשר, בכל מחלקה (workspace) שהיא.
-- לידים (contacts בשלב open/meeting, מוצג בעמוד /sales/leads) ממשיכים
-- להיות מסוננים בקוד לפי ה-workspace הנוכחי של המשתמש - זה לא משתנה כאן.
-- ============================================================

drop policy if exists "contacts_modify_workspace_member" on public.contacts;
drop policy if exists "contacts_select_workspace_member" on public.contacts;
drop policy if exists "contacts_select_policy" on public.contacts;

create policy "contacts_all_authenticated"
  on public.contacts for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );


-- ================= 0007_contacts_tasks_extra_fields.sql =================
-- ============================================================
-- Migration: שדות נוספים לאנשי קשר ומשימות
-- ============================================================

-- טלפון נוסף + תאריך "טיפול אחרון" (לספירת זמן על לידים)
alter table public.contacts
  add column if not exists phone2 text;
alter table public.contacts
  add column if not exists last_activity_at timestamptz not null default now();

-- שעת יעד + תזכורת למשימות
alter table public.tasks
  add column if not exists due_time time;
alter table public.tasks
  add column if not exists remind_minutes_before integer;


-- ================= 0008_per_department_pipelines.sql =================
-- ============================================================
-- Migration: Pipeline נפרד לכל מחלקה (לפי אפיון CRM)
-- ============================================================

-- שדה סיבת סגירה (לליד שנסגר בלי להירשם/לתרום)
alter table public.contacts add column if not exists closed_reason text;

-- מיפוי הערכים הישנים (open/meeting/process/registered/closed) לערכים החדשים,
-- לפי ה-pipeline המתאים למחלקה של כל איש קשר
update public.contacts c
set stage = case
  when w.name in ('דעת למדני', 'דעת ותבונה', 'מרכז דעת — ראשי') then
    case c.stage
      when 'open' then 'open'
      when 'meeting' then 'meeting'
      when 'process' then 'registering'
      when 'registered' then 'registered'
      when 'closed' then 'closed'
      else c.stage
    end
  when w.name = 'תרומות' then
    case c.stage
      when 'open' then 'potential'
      when 'meeting' then 'contacted'
      when 'process' then 'offer'
      when 'registered' then 'donated'
      when 'closed' then 'closed'
      else c.stage
    end
  else c.stage
end
from public.workspaces w
where c.workspace_id = w.id;

-- מחליפים את מגבלת הערכים הישנה (5 ערכים כלליים) בחדשה (כל הערכים מכל ה-pipelines)
alter table public.contacts drop constraint if exists contacts_stage_check;

alter table public.contacts
  add constraint contacts_stage_check check (stage in (
    'new_lead', 'open', 'meeting', 'registering', 'registered', 'started', 'active_student', 'graduate',
    'potential', 'no_contact_yet', 'contacted', 'call', 'offer', 'committed', 'donated', 'active_donor',
    'closed'
  ));


-- ================= 0009_contact_multi_department.sql =================
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


-- ================= 0010_lead_inquiries.sql =================
-- ============================================================
-- Migration: היסטוריית פניות לכל שיוך מחלקה - "מהות הפנייה" נשמרת בנפרד
-- לכל פנייה (לא נמחקת/נדרסת בפנייה הבאה), כדי שתישאר היסטוריה מלאה.
-- ============================================================

create table if not exists public.lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_department_id uuid not null references public.contact_departments(id) on delete cascade,
  reason text not null,
  note text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.lead_inquiries enable row level security;

drop policy if exists "lead_inquiries_all_authenticated" on public.lead_inquiries;
create policy "lead_inquiries_all_authenticated"
  on public.lead_inquiries for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

-- לכל שיוך מחלקה קיים שעדיין אין לו אף פנייה רשומה - יוצר פנייה ראשונית
-- כדי שלא יישארו שיוכים בלי היסטוריה כלל
insert into public.lead_inquiries (contact_department_id, reason, created_at)
select cd.id, 'פנייה ראשונית (לפני התכונה)', cd.created_at
from public.contact_departments cd
where not exists (select 1 from public.lead_inquiries li where li.contact_department_id = cd.id);


-- ================= 0011_email_connections.sql =================
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


-- ================= 0012_contact_frozen_and_personal_fields.sql =================
-- ============================================================
-- Migration: הקפאת איש קשר + שדות אישיים נוספים (תאריך לידה, מגדר)
-- ============================================================

-- הקפאת איש קשר - חוסמת כל שינוי (עריכה/שלב/משימות/הערות) עד הפשרה
-- מפורשת ע"י owner/admin של אחת המחלקות שהוא משויך אליהן. האכיפה
-- בפועל נעשית בקוד השרת (Server Actions), לא ב-RLS - תואם את שאר
-- המערכת שאין בה היום שום בדיקת תפקיד ברמת המסד.
alter table public.contacts
  add column if not exists frozen boolean not null default false;

create index if not exists idx_contacts_frozen
  on public.contacts (frozen) where frozen = true;

-- שדות אישיים נוספים לתצוגה בכרטיס - גיל ותאריך עברי מחושבים בזמן
-- אמת מתוך birth_date, לא נשמרים כשדה נפרד
alter table public.contacts
  add column if not exists birth_date date,
  add column if not exists gender text;


-- ================= 0013_realtime_contact_departments.sql =================
-- ============================================================
-- Migration: מפעיל Realtime על contact_departments - כדי שהודעת
-- "נכנס ליד חדש" תקפוץ בזמן אמת בכל האתר כשמתווסף שיוך מחלקה חדש.
-- ============================================================

alter publication supabase_realtime add table public.contact_departments;


-- ================= 0014_sent_emails.sql =================
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


-- ================= 0015_email_connections_one_per_workspace.sql =================
-- ============================================================
-- Migration: מפרידה בין תיבת מייל לקליטת לידים נכנסים (intake)
-- לבין תיבת מייל לשליחת מיילים יוצאים לאנשי קשר (send) - לכל
-- מחלקה יכולה להיות תיבה אחת לכל תפקיד (לא בהכרח אותה תיבה).
-- ============================================================

alter table public.email_connections
  add column if not exists purpose text not null default 'intake'
    check (purpose in ('intake', 'send'));

alter table public.email_connections
  add constraint email_connections_workspace_purpose_key unique (workspace_id, purpose);


-- ================= 0016_sent_whatsapp.sql =================
-- ============================================================
-- Migration: תיעוד הודעות WhatsApp שנשלחו מתוך המערכת לאנשי קשר -
-- מוצג בטאב "פעילות" בכרטיס איש הקשר, בדומה ל-sent_emails.
-- ============================================================

create table if not exists public.sent_whatsapp (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone text not null,
  reason text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);

alter table public.sent_whatsapp enable row level security;

drop policy if exists "sent_whatsapp_all_authenticated" on public.sent_whatsapp;
create policy "sent_whatsapp_all_authenticated"
  on public.sent_whatsapp for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );


-- ================= 0017_sent_whatsapp_chat.sql =================
-- ============================================================
-- Migration: תמיכה בהודעות צ'אט חופשיות ב-WhatsApp (בנוסף להודעת
-- התבנית הראשונה) - נשלחות רק בתוך 24 שעות מתשובת הלקוח האחרונה.
-- ============================================================

alter table public.sent_whatsapp
  add column if not exists kind text not null default 'template'
    check (kind in ('template', 'chat'));

alter table public.sent_whatsapp
  add column if not exists message text;


-- ================= 0018_task_created_by.sql =================
-- ============================================================
-- Migration: מפרידה בין "מי יצר את המשימה" (created_by, קבוע) לבין
-- "למי היא מוקצית" (assigned_to, ניתן לבחירה/שינוי) - עד כה assigned_to
-- שימש בפועל כ"יוצר" בלבד, בלי דרך לייעד משימה למישהו אחר.
-- ============================================================

alter table public.tasks
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.tasks set created_by = assigned_to where created_by is null;


-- ================= 0019_whatsapp_incoming.sql =================
-- ============================================================
-- Migration: תמיכה בהודעות WhatsApp נכנסות (מהלקוח) - נרשמות באותה
-- טבלה כמו הודעות יוצאות, עם כיוון (direction). contact_id/workspace_id
-- הופכים לא-חובה כי הודעה נכנסת עשויה להגיע ממספר שלא משויך לאף איש
-- קשר קיים במערכת.
-- ============================================================

alter table public.sent_whatsapp alter column contact_id drop not null;
alter table public.sent_whatsapp alter column workspace_id drop not null;

alter table public.sent_whatsapp
  add column if not exists direction text not null default 'out'
    check (direction in ('in', 'out'));

alter table public.sent_whatsapp
  add column if not exists channel text;


-- ================= 0020_whatsapp_templates.sql =================
-- ============================================================
-- Migration: רשימת תבניות WhatsApp מאושרות שאפשר לבחור ביניהן
-- בשליחה - במקום תבנית אחת קבועה (INFORU_TEMPLATE_ID).
-- ============================================================

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id text not null,
  preview_text text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_templates enable row level security;

drop policy if exists "whatsapp_templates_all_authenticated" on public.whatsapp_templates;
create policy "whatsapp_templates_all_authenticated"
  on public.whatsapp_templates for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

insert into public.whatsapp_templates (name, template_id, preview_text)
select 'הודעה ראשונה - מרכז דעת', '272006', 'שלום {שם פרטי}, פנית אלינו במרכז דעת בנוגע ל{נושא הפנייה}. נשמח לחזור אליך בהקדם. בברכה, צוות מרכז דעת.'
where not exists (select 1 from public.whatsapp_templates where template_id = '272006');


-- ================= 0021_contacts_email2.sql =================
-- ============================================================
-- Migration: מייל נוסף לאיש קשר (בדומה לטלפון נוסף שכבר קיים) - נחוץ
-- כדי שבמיזוג כפילויות אפשר יהיה לשמור גם את המייל וגם את הטלפון
-- של שני הכרטיסים, לא רק לבחור אחד מהם.
-- ============================================================

alter table public.contacts add column if not exists email2 text;


-- ================= 0022_email_templates.sql =================
-- ============================================================
-- Migration: תבניות מייל מוכנות מראש לשליחה מהירה מהכרטיס - בדומה
-- לתבניות WhatsApp.
-- ============================================================

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "email_templates_all_authenticated" on public.email_templates;
create policy "email_templates_all_authenticated"
  on public.email_templates for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );


-- ================= 0023_contacts_photo_and_related.sql =================
-- ============================================================
-- Migration: תמונת פרופיל לאיש קשר (bucket ציבורי ב-Storage) + קישור
-- לאיש קשר קרוב (למשל קרבה משפחתית) שמוביל לכרטיס אחר.
-- ============================================================

alter table public.contacts add column if not exists photo_url text;
alter table public.contacts add column if not exists related_contact_id uuid references public.contacts(id) on delete set null;
alter table public.contacts add column if not exists relation_label text;

insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do nothing;


-- ================= 0024_user_activity.sql =================
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


-- ================= 0025_contact_audit_log.sql =================
-- ============================================================
-- Migration: יומן שינויים (audit log) לפעולות ניהול על איש קשר -
-- הקפאה/הפשרה, מיזוג כפילויות, הסרה ממחלקה, מחיקה. contact_id בלי
-- foreign key לטבלת contacts (בכוונה) - כדי שרשומת "נמחק" תישאר בעינה
-- גם אחרי שהכרטיס עצמו כבר לא קיים; contact_name הוא צילום מצב של
-- השם בזמן הפעולה, לא lookup חי.
-- ============================================================

create table if not exists public.contact_audit_log (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  contact_name text not null,
  action text not null,
  detail text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contact_audit_log_contact_id_idx on public.contact_audit_log (contact_id, created_at desc);

alter table public.contact_audit_log enable row level security;

drop policy if exists "contact_audit_log_all_authenticated" on public.contact_audit_log;
create policy "contact_audit_log_all_authenticated"
  on public.contact_audit_log for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );


