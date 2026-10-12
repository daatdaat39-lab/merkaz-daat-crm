-- תיקון באג אמיתי שנמצא באימות-חי: lock_lead (0148) ו-lock_service_case
-- (0151) השתמשו ב-"select ..., true into ..., v_found" כדי לזהות אם
-- השורה נמצאה - אבל ב-plpgsql, select...into שלא מחזיר אף שורה מאפס
-- את **כל** המשתנים ל-NULL (כולל v_found!), לא משאיר אותם בערך הקודם.
-- "if not v_found" על NULL מתנהג כמו false (לוגיקה תלת-ערכית) - אז
-- התנאי לא מתבצע, הפונקציה ממשיכה, ה-UPDATE הבא לא פוגע באף שורה (כי
-- השורה לא קיימת), והפונקציה מחזירה true בטעות - "ננעל בהצלחה" על ליד/
-- קריאה שלא קיימים בכלל. אומת בפועל: שתי הפונקציות החזירו true על uuid
-- לא-קיים. התיקון: "if not found" (המשתנה המובנה של plpgsql, שכן מדווח
-- נכון אם ה-select האחרון החזיר שורה) במקום דגל-ידני.
create or replace function public.lock_lead(p_department_id uuid, p_caller uuid, p_stale_minutes int default 15)
returns boolean
language plpgsql as $$
declare
  v_locked_by uuid;
  v_locked_at timestamptz;
begin
  select locked_by, locked_at into v_locked_by, v_locked_at
  from public.contact_departments
  where id = p_department_id
  for update skip locked;

  if not found then
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

create or replace function public.lock_service_case(p_case_id uuid, p_caller uuid, p_stale_minutes int default 15)
returns boolean
language plpgsql as $$
declare
  v_locked_by uuid;
  v_locked_at timestamptz;
begin
  select locked_by, locked_at into v_locked_by, v_locked_at
  from public.service_cases
  where id = p_case_id
  for update skip locked;

  if not found then
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
