-- שלב 2 מתוכנית-העיצוב-מחדש: תשתית-AI לצ'יפ "מה-הפעולה-עכשיו".
--
-- עיקרון-מפתח: הטקסט המוצג הוא שרשור של (א) המשפט מה-AI, שנשמר כאן
-- בקאש ומתעדכן רק כש-stale=true, ו-(ב) "כמה זמן עבר" - מחושב בקוד
-- מ-last_activity_at הקיים, בלי שום קריאת-AI. שני מנגנוני-stale
-- נפרדים (ליד/קריאה) כי לכל אחד שדות-שינוי שונים.
alter table public.contact_departments
  add column if not exists ai_action_summary text,
  add column if not exists ai_action_summary_updated_at timestamptz,
  add column if not exists ai_action_summary_stale boolean not null default true;

alter table public.service_cases
  add column if not exists ai_action_summary text,
  add column if not exists ai_action_summary_updated_at timestamptz,
  add column if not exists ai_action_summary_stale boolean not null default true;

create or replace function public.mark_lead_ai_stale()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage
     or new.agent_id is distinct from old.agent_id
     or new.last_activity_at is distinct from old.last_activity_at then
    new.ai_action_summary_stale := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_lead_ai_stale on public.contact_departments;
create trigger trg_mark_lead_ai_stale
  before update on public.contact_departments
  for each row execute function public.mark_lead_ai_stale();

create or replace function public.mark_case_ai_stale()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     or new.severity is distinct from old.severity
     or new.assigned_to is distinct from old.assigned_to then
    new.ai_action_summary_stale := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_case_ai_stale on public.service_cases;
create trigger trg_mark_case_ai_stale
  before update on public.service_cases
  for each row execute function public.mark_case_ai_stale();

-- כללים/תרחישים (ניהול-מנהל) - הרחבת reference_content הקיימת (לא
-- טבלה מקבילה), kind מקבל ערך שלישי 'rule'. trigger_condition/
-- suggested_action הם השדות שה-AI-prompt צורך; auto_suggested/approved
-- הם ה-hook ששלב 3 (הצעת-כללים-חדשים) ישתמש בו - מוגדרים כבר עכשיו
-- כדי לא לצטרך alter נוסף אז. לכללים שמנהל כותב ידנית: auto_suggested
-- נשאר false, approved נשאר true (ברירות-המחדל).
alter table public.reference_content drop constraint if exists reference_content_kind_check;
alter table public.reference_content add constraint reference_content_kind_check check (kind in ('playbook', 'kb', 'rule'));
alter table public.reference_content
  add column if not exists trigger_condition text,
  add column if not exists suggested_action text,
  add column if not exists auto_suggested boolean not null default false,
  add column if not exists approved boolean not null default true;
