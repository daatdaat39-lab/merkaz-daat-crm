-- ============================================================
-- 0185 - היסטוריית מעברי שלב (lead_stage_events), שלב 6 בתוכנית הדוחות.
-- עד היום contact_departments.stage שמר רק את השלב הנוכחי - אי אפשר היה
-- לדעת מתי ליד עבר ל"נרשם", כמה זמן הוא ישב בכל שלב, או כמה לידים התקדמו
-- השבוע. טריגר ב-DB רושם כל כניסה לתהליך וכל שינוי שלב, מכל מקור (מסך
-- הלידים, כרטיס איש הקשר, אוטומציה, ייבוא) - בלי לגעת בקוד האפליקציה.
-- אדיטיבי ואידמפוטנטי - בטוח להרצה חוזרת. rollback בסוף הקובץ.
--
-- חשוב: אין "בדיעבד". ההיסטוריה מתחילה ברגע ההרצה; מעברים שקרו לפני כן לא
-- ניתנים לשחזור, ולכן בכוונה אין שום backfill מומצא.
-- ============================================================

create table if not exists public.lead_stage_events (
  id uuid primary key default gen_random_uuid(),
  contact_department_id uuid not null references public.contact_departments(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  -- from_stage ריק = כניסה לתהליך (ליד חדש, או פתיחת תהליך על רשומה קיימת)
  from_stage text,
  to_stage text not null,
  -- auth.uid() של מי ששינה; ריק כשהשינוי בא משרת (אוטומציה/ייבוא/webhook)
  changed_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists lead_stage_events_ws_stage_time_idx
  on public.lead_stage_events (workspace_id, to_stage, occurred_at desc);
create index if not exists lead_stage_events_dept_time_idx
  on public.lead_stage_events (contact_department_id, occurred_at);

-- קריאה לכל משתמש מחובר (כמו שאר הטבלאות במערכת); כתיבה - רק דרך הטריגר
-- (אין policy ל-insert/update/delete ללקוח, כך שאי אפשר לערוך היסטוריה).
alter table public.lead_stage_events enable row level security;
drop policy if exists lead_stage_events_select on public.lead_stage_events;
create policy lead_stage_events_select on public.lead_stage_events
  for select using (auth.uid() is not null);

-- הטריגר רושם רק תהליכים אמיתיים (opened_process <> false) - שיוכים שיובאו
-- כהיסטוריה בלבד (opened_process=false) לא נחשבים מעבר שלב ולא יציפו את
-- היומן בייבוא המוני.
create or replace function public.log_contact_department_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.opened_process is distinct from false then
      insert into public.lead_stage_events
        (contact_department_id, contact_id, workspace_id, course_id, from_stage, to_stage, changed_by)
      values (new.id, new.contact_id, new.workspace_id, new.course_id, null, new.stage, auth.uid());
    end if;
  elsif tg_op = 'UPDATE' then
    if new.opened_process is distinct from false then
      if old.opened_process = false then
        -- פתיחת תהליך על רשומה קיימת: כניסה לתהליך בשלב הנוכחי
        insert into public.lead_stage_events
          (contact_department_id, contact_id, workspace_id, course_id, from_stage, to_stage, changed_by)
        values (new.id, new.contact_id, new.workspace_id, new.course_id, null, new.stage, auth.uid());
      elsif new.stage is distinct from old.stage then
        insert into public.lead_stage_events
          (contact_department_id, contact_id, workspace_id, course_id, from_stage, to_stage, changed_by)
        values (new.id, new.contact_id, new.workspace_id, new.course_id, old.stage, new.stage, auth.uid());
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contact_departments_stage_events on public.contact_departments;
create trigger contact_departments_stage_events
  after insert or update of stage, opened_process on public.contact_departments
  for each row execute function public.log_contact_department_stage_change();

-- ------------------------------------------------------------
-- rollback (רק אם צריך לבטל):
--   drop trigger if exists contact_departments_stage_events on public.contact_departments;
--   drop function if exists public.log_contact_department_stage_change();
--   drop table if exists public.lead_stage_events;
-- ------------------------------------------------------------
