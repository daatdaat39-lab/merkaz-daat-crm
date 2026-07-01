-- ============================================================
-- Migration: Pipeline (stage/source), Tasks, Meetings + demo data
-- ============================================================

-- 1) עמודות חדשות ל-contacts: שלב בפייפליין, מקור ליד, סוכן אחראי
alter table public.contacts
  add column if not exists stage text not null default 'open'
    check (stage in ('open','meeting','process','registered','closed'));

alter table public.contacts
  add column if not exists source text;

alter table public.contacts
  add column if not exists agent_id uuid references public.profiles(id) on delete set null;

alter table public.contacts
  add column if not exists notes text;

-- 2) טבלת פגישות
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  title text,
  meeting_date date not null,
  meeting_time time not null,
  type text not null default 'פרונטלי',
  location text,
  agent_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- 3) טבלת משימות
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
-- RLS על הטבלאות החדשות
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

-- מוסיפים גישת insert/update/delete ל-contacts (select כבר קיים ממקודם)
drop policy if exists "contacts_modify_workspace_member" on public.contacts;
create policy "contacts_modify_workspace_member"
  on public.contacts for all
  using ( public.is_workspace_member(workspace_id) )
  with check ( public.is_workspace_member(workspace_id) );

-- ============================================================
-- נתוני דמה — רק אם עוד אין הרבה אנשי קשר (מונע כפילויות בהרצה חוזרת)
-- ============================================================
do $$
declare
  ws_id uuid;
  demo_agent uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid;
begin
  select id into ws_id from public.workspaces order by created_at asc limit 1;
  select id into demo_agent from public.profiles limit 1;

  if ws_id is not null and not exists (
    select 1 from public.contacts where email = 'demo-lead-1@example.com'
  ) then

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('אורי','שלום','052-1000001','demo-lead-1@example.com','לימודי','{חדש}',ws_id,'open','אתר',demo_agent, now() - interval '1 day')
    returning id into c1;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('גל','ברק','052-1000002','demo-lead-2@example.com','תרומות','{VIP}',ws_id,'meeting','המלצה',demo_agent, now() - interval '2 day')
    returning id into c2;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('תמר','לוי','052-1000003','demo-lead-3@example.com','לימודי','{חוזר}',ws_id,'process','פייסבוק',demo_agent, now() - interval '4 day')
    returning id into c3;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('איתמר','כהן','052-1000004','demo-lead-4@example.com','תרומות','{תרומה גדולה}',ws_id,'registered','אתר',demo_agent, now() - interval '6 day')
    returning id into c4;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('נועה','אברהם','052-1000005','demo-lead-5@example.com','לימודי','{חדש}',ws_id,'open','המלצה',demo_agent, now() - interval '1 day')
    returning id into c5;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('רון','מזרחי','050-1000006','demo-lead-6@example.com','לימודי','{}',ws_id,'meeting','אתר',demo_agent, now() - interval '3 day')
    returning id into c6;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('דנה','פרץ','050-1000007','demo-lead-7@example.com','תרומות','{VIP}',ws_id,'closed','אתר',demo_agent, now() - interval '10 day')
    returning id into c7;

    insert into public.contacts (first, last, phone, email, dept, tags, workspace_id, stage, source, agent_id, created_at)
    values ('יובל','גולן','050-1000008','demo-lead-8@example.com','לימודי','{חוזר}',ws_id,'process','פייסבוק',demo_agent, now() - interval '5 day')
    returning id into c8;

    -- פגישות דמה
    insert into public.meetings (workspace_id, contact_id, title, meeting_date, meeting_time, type, location, agent_id, notes)
    values
      (ws_id, c2, 'פגישת היכרות', current_date + 1, '10:00', 'פרונטלי', 'משרד ראשי', demo_agent, 'להביא חוברת מידע'),
      (ws_id, c6, 'ראיון אישי', current_date + 2, '13:30', 'טלפוני', null, demo_agent, null),
      (ws_id, c3, 'שיחת המשך', current_date - 1, '09:00', 'פרונטלי', 'משרד ראשי', demo_agent, 'התקיימה בהצלחה');

    -- משימות דמה
    insert into public.tasks (workspace_id, contact_id, title, description, due_date, done, assigned_to)
    values
      (ws_id, c1, 'להתקשר ולתאם פגישה', 'ליד חדש מהאתר', current_date, false, demo_agent),
      (ws_id, c2, 'לשלוח תזכורת לפגישה מחר', null, current_date, false, demo_agent),
      (ws_id, c4, 'לוודא קבלת תשלום תרומה', null, current_date + 1, false, demo_agent),
      (ws_id, null, 'לעדכן חוברת מידע לליד חדשים', 'משימה כללית', current_date + 3, false, demo_agent),
      (ws_id, c7, 'לסגור תיק - ליד לא ממשיך', null, current_date - 2, true, demo_agent);

  end if;
end $$;
