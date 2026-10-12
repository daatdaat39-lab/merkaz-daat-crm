-- שלב 1 ממודול מכירות/שירות: קטלוג קורסים + מכירות (course_purchases,
-- טבלה חדשה - לא הרחבה של contact_course_enrollments הקיימת, כי זו
-- טבלת-היסטוריה-מייבוא-אורביט עם מחזור-חיים שונה לגמרי ממכירה-חיה
-- עם מחיר/סטטוס/נציג-מוכר - וגם כדי לא להתנגש בשם-קוד עם הטבלה הקיימת)
-- + נעילת-ליד (contact_departments.locked_by/locked_at - לא על contacts
-- עצמו, כדי ששתי מחלקות שונות יוכלו לעבוד על אותו איש-קשר בו-זמנית בלי
-- התנגשות-שווא).

-- קטלוג גלובלי (לא per-workspace כמו picklists/workspace_extra_fields) -
-- קורס שנמכר ע"י "מכירות" וטופל אח"כ ע"י "שירות" חייב להיות אותה שורה
-- כדי ששני הצדדים יתייחסו לאותו קורס אמיתי, לא לעותקים-כפולים.
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text,
  price numeric,
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.courses enable row level security;
drop policy if exists "courses_all_authenticated" on public.courses;
create policy "courses_all_authenticated" on public.courses for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists public.course_purchases (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_department_id uuid references public.contact_departments(id) on delete set null,
  price numeric,
  status text not null default 'pending',
  enrolled_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists course_purchases_contact_idx on public.course_purchases(contact_id);
create index if not exists course_purchases_course_idx on public.course_purchases(course_id);
alter table public.course_purchases enable row level security;
drop policy if exists "course_purchases_all_authenticated" on public.course_purchases;
create policy "course_purchases_all_authenticated" on public.course_purchases for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- נעילת-ליד - דגם מדויק של heartbeat_campaign_contact_claim/
-- release_campaign_contact_claim (0119/0092) ולא שימוש-חוזר בהן (קשורות-
-- הדוק לכללי-תור-שיחות) - staleness 15 דקות, כמו בתור-השיחות בפועל.
alter table public.contact_departments
  add column if not exists locked_by uuid references auth.users(id),
  add column if not exists locked_at timestamptz;

-- for update skip locked על שורה בודדת, בדיוק כמו claim_specific_campaign_contact
-- (0140) - כולל אותו תיקון שכבר נלמד שם: תפיסה-עצמית (caller כבר המחזיק)
-- תמיד מותרת, לא רק תפיסה-של-שורה-פנויה-או-ישנה.
create or replace function public.lock_lead(p_department_id uuid, p_caller uuid, p_stale_minutes int default 15)
returns boolean
language plpgsql as $$
declare
  v_locked_by uuid;
  v_locked_at timestamptz;
  v_found boolean := false;
begin
  select locked_by, locked_at, true into v_locked_by, v_locked_at, v_found
  from public.contact_departments
  where id = p_department_id
  for update skip locked;

  if not v_found then
    return false;
  end if;
  if v_locked_by is not null and v_locked_by <> p_caller and v_locked_at >= now() - (p_stale_minutes || ' minutes')::interval then
    return false;
  end if;

  update public.contact_departments
  set locked_by = p_caller, locked_at = now()
  where id = p_department_id;

  return true;
end;
$$;

create or replace function public.heartbeat_lead_lock(p_department_id uuid, p_caller uuid)
returns boolean
language plpgsql as $$
declare v_updated boolean := false;
begin
  update public.contact_departments
  set locked_at = now()
  where id = p_department_id and locked_by = p_caller
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

create or replace function public.release_lead_lock(p_department_id uuid, p_caller uuid)
returns void language sql as $$
  update public.contact_departments
  set locked_by = null, locked_at = null
  where id = p_department_id and locked_by = p_caller;
$$;
