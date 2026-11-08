-- ============================================================
-- 0184 - סטטוס חשבון, תפקידים נוספים ויומן-ביקורת קבוע (שלב 2 בתוכנית
-- "לבנות הכל", 8.11.2026). אדיטיבי בלבד ואידמפוטנטי - בטוח להרצה חוזרת.
-- מורצת ידנית ב-Supabase SQL Editor. rollback בסוף הקובץ (כהערה).
-- ============================================================

-- 1) סטטוס חשבון - "השבתה" במקום מחיקה (offboarding): משתמש מושבת לא
-- יכול להתחבר ולא רואה כלום, אבל כל ההיסטוריה שלו (פעילות, לידים שטיפל
-- בהם) נשמרת. org_role='super_admin' = מנהל מערכת ברמת הארגון (בנפרד
-- מ-owner של מחלקה אחת).
alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists org_role text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists suspended_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('active', 'invited', 'suspended'));
alter table public.profiles drop constraint if exists profiles_org_role_check;
alter table public.profiles
  add constraint profiles_org_role_check check (org_role is null or org_role in ('super_admin'));

-- 2) שני תפקידי מחלקה נוספים: נציג שירות וצופה (קריאה בלבד).
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'member', 'telemarketer', 'service', 'viewer'));

-- 3) האם נציגי המחלקה רואים את כל הלידים או רק את אלה ששויכו אליהם.
-- ברירת מחדל true = אין שינוי בהתנהגות הקיימת.
alter table public.workspaces
  add column if not exists agents_see_all_leads boolean not null default true;

-- 4) יומן ביקורת "append-only": הכנסה מותרת לכל משתמש מחובר רק על שמו
-- (actor_id = auth.uid()), קריאה למנהלים בלבד, ואין policy לעדכון/מחיקה -
-- כך שאי אפשר לערוך או למחוק רשומה מהאפליקציה.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists audit_events_actor_idx on public.audit_events (actor_id, created_at desc);

alter table public.audit_events enable row level security;

drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_insert on public.audit_events
  for insert with check (auth.uid() is not null and actor_id = auth.uid());

drop policy if exists audit_events_select_manager on public.audit_events;
create policy audit_events_select_manager on public.audit_events
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  );

-- ------------------------------------------------------------
-- rollback (רק אם צריך לבטל):
--   drop table if exists public.audit_events;
--   alter table public.workspaces drop column if exists agents_see_all_leads;
--   alter table public.workspace_members drop constraint if exists workspace_members_role_check;
--   alter table public.workspace_members add constraint workspace_members_role_check
--     check (role in ('owner','admin','member','telemarketer'));
--   alter table public.profiles drop column if exists suspended_at,
--     drop column if exists must_change_password, drop column if exists org_role,
--     drop column if exists status;
-- ------------------------------------------------------------
