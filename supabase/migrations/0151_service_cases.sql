-- שלב 4 ממודול מכירות/שירות: קריאות-שירות (tickets) + SLA + נעילה
-- נפרדת-מהליד (ר' ארכיטקטורה-טכנית #3 בתוכנית) - לקוח אחד יכול לקבל
-- כמה קריאות-שירות בו-זמנית, אז הנעילה חיה ישירות על service_cases.id
-- ולא על contact_departments כמו בשלב 3. workspace_id הוא FK רגיל לכל
-- מחלקה (לא "מחלקת שירות" ייעודית) - בדיוק כמו tasks/contacts/campaigns,
-- כי כל מחלקה עשויה לייצר קריאת-שירות (בעיית-חיוב אצל תורם, בעיה
-- מנהלתית אצל תלמיד וכו').
create table if not exists public.service_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigserial unique,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid references auth.users(id),
  sla_due_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  locked_by uuid references auth.users(id),
  locked_at timestamptz
);
create index if not exists service_cases_contact_idx on public.service_cases(contact_id);
create index if not exists service_cases_workspace_status_idx on public.service_cases(workspace_id, status);
alter table public.service_cases enable row level security;
drop policy if exists "service_cases_all_authenticated" on public.service_cases;
create policy "service_cases_all_authenticated" on public.service_cases for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- 3 RPC-ים נפרדים מ-lock_lead/heartbeat_lead_lock/release_lead_lock
-- (migration 0148) - לא שימוש-חוזר, כי הנעילה כאן חיה ישירות על שורת-
-- הקריאה עצמה, לא על contact_departments. אותו עיקרון staleness (15 דק').
create or replace function public.lock_service_case(p_case_id uuid, p_caller uuid, p_stale_minutes int default 15)
returns boolean
language plpgsql as $$
declare
  v_locked_by uuid;
  v_locked_at timestamptz;
  v_found boolean := false;
begin
  select locked_by, locked_at, true into v_locked_by, v_locked_at, v_found
  from public.service_cases
  where id = p_case_id
  for update skip locked;

  if not v_found then
    return false;
  end if;
  if v_locked_by is not null and v_locked_by <> p_caller and v_locked_at >= now() - (p_stale_minutes || ' minutes')::interval then
    return false;
  end if;

  update public.service_cases
  set locked_by = p_caller, locked_at = now()
  where id = p_case_id;

  return true;
end;
$$;

create or replace function public.heartbeat_service_case_lock(p_case_id uuid, p_caller uuid)
returns boolean
language plpgsql as $$
declare v_updated boolean := false;
begin
  update public.service_cases
  set locked_at = now()
  where id = p_case_id and locked_by = p_caller
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

create or replace function public.release_service_case_lock(p_case_id uuid, p_caller uuid)
returns void language sql as $$
  update public.service_cases
  set locked_by = null, locked_at = null
  where id = p_case_id and locked_by = p_caller;
$$;

-- "תגובה-מהירה" במסך-השירות (שלב 4 ב-UI) - תבנית-וואטסאפ יכולה להיות
-- משויכת לקורס ספציפי כדי שרק תבניות רלוונטיות יוצעו בקריאה על אותו קורס.
-- nullable = תבנית כללית, מוצעת בכל קריאה ללא תלות בקורס.
alter table public.whatsapp_templates
  add column if not exists course_id uuid references public.courses(id) on delete set null;
