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
