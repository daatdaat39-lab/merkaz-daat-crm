-- ============================================================
-- Migration: סבב שדרוגים שני - ארבעה נושאים בקובץ אחד (כדי לחסוך
-- הרצות ידניות נפרדות ב-Supabase):
--   1. תיבת אישורי לידים למנהל  (עמודות על contact_departments)
--   2. קמפיינים                  (campaigns + campaign_contacts)
--   3. היסטוריית שיחות מיובאת    (contact_call_history)
--   4. לוח שנה והקדשות           (calendar_dedications)
-- כל הטבלאות באותו דפוס כמו שאר המערכת: uuid pk, RLS פתוח
-- (auth.uid() is not null) והאכיפה האמיתית בקוד השרת.
-- ============================================================

-- ---------- 1. אישור לידים ע"י מנהל ----------
-- approval_status: לידים חדשים במחלקת תרומות נוצרים כ-'pending' וממתינים
-- לאישור המנהל (בחירת נציג ושיגור). ברירת המחדל 'approved' בכוונה, כדי
-- שכל השורות הקיימות וכל שאר המחלקות ימשיכו לעבוד בדיוק כמו היום.
alter table public.contact_departments
  add column if not exists approval_status text not null default 'approved';
alter table public.contact_departments
  add column if not exists created_by_manager boolean not null default false;
alter table public.contact_departments
  add column if not exists assigned_by uuid references auth.users(id) on delete set null;

create index if not exists contact_departments_approval_idx
  on public.contact_departments(workspace_id, approval_status);

-- ---------- 2. קמפיינים ----------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  channel text,                      -- שיחה / וואטסאפ / מייל / פגישה
  status text not null default 'active',  -- active | closed
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  category text,                     -- חם / קר / תורם בסכום גדול וכו'
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'pending',  -- pending | done
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_contacts_campaign_idx on public.campaign_contacts(campaign_id);

-- ---------- 3. היסטוריית שיחות מיובאת ----------
-- external_row_key: מזהה ייחודי שנבנה מהשורה בקובץ המקור (שם+תאריך+מקור)
-- כדי שייבוא חוזר של אותו קובץ לא יכפיל רשומות.
create table if not exists public.contact_call_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  call_date date,
  response_text text,
  source_system text,
  external_row_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists contact_call_history_contact_idx on public.contact_call_history(contact_id);

-- ---------- 4. לוח שנה והקדשות ----------
create table if not exists public.calendar_dedications (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  dedication_date date not null,
  dedication_text text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_dedications_date_idx on public.calendar_dedications(dedication_date);
create index if not exists calendar_dedications_contact_idx on public.calendar_dedications(contact_id);

-- ---------- RLS לכל הטבלאות החדשות ----------
alter table public.campaigns enable row level security;
drop policy if exists "campaigns_all_authenticated" on public.campaigns;
create policy "campaigns_all_authenticated" on public.campaigns for all
  using ( auth.uid() is not null ) with check ( auth.uid() is not null );

alter table public.campaign_contacts enable row level security;
drop policy if exists "campaign_contacts_all_authenticated" on public.campaign_contacts;
create policy "campaign_contacts_all_authenticated" on public.campaign_contacts for all
  using ( auth.uid() is not null ) with check ( auth.uid() is not null );

alter table public.contact_call_history enable row level security;
drop policy if exists "contact_call_history_all_authenticated" on public.contact_call_history;
create policy "contact_call_history_all_authenticated" on public.contact_call_history for all
  using ( auth.uid() is not null ) with check ( auth.uid() is not null );

alter table public.calendar_dedications enable row level security;
drop policy if exists "calendar_dedications_all_authenticated" on public.calendar_dedications;
create policy "calendar_dedications_all_authenticated" on public.calendar_dedications for all
  using ( auth.uid() is not null ) with check ( auth.uid() is not null );
