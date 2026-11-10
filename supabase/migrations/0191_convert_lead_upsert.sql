-- תיקון-באג: סיום-רישום-חוזר אחרי ביטול-הרשמה (cancelCoursePurchase) היה
-- נכשל תמיד עם שגיאת-DB גולמית - "duplicate key value violates unique
-- constraint course_purchases_contact_department_unique_idx" (migration
-- 0176). הסיבה: האינדקס-הייחודי לא מבחין בין שורה פעילה למבוטלת, וה-RPC
-- הזו (migration 0150) תמיד עשתה insert גרידא בלי-לטפל-בהתנגשות. אומת
-- בפועל בפרודקשן (ליד-בדיקה עם הרשמה-שבוטלה-בעבר) - 2026-11-10.
--
-- התיקון: insert ... on conflict ... do update על אותו אינדקס-ייחודי
-- הקיים - אם כבר יש שורה (גם-מבוטלת) לאותו contact_department_id,
-- מעדכנים אותה במקום לנסות-ליצור-שורה-נוספת. בלי שינוי-קוד-JS נדרש -
-- אותה חתימת-RPC בדיוק, אותו ערך-מוחזר (uuid).
create or replace function public.convert_lead_to_purchase(
  p_department_id uuid, p_course_id uuid, p_price numeric, p_caller uuid, p_won_stage text
)
returns uuid
language plpgsql as $$
declare
  v_contact_id uuid;
  v_workspace_id uuid;
  v_purchase_id uuid;
begin
  select contact_id, workspace_id into v_contact_id, v_workspace_id
  from public.contact_departments
  where id = p_department_id
  for update;

  if v_contact_id is null then
    raise exception 'lead not found';
  end if;

  update public.contact_departments
  set stage = p_won_stage, last_activity_at = now()
  where id = p_department_id;

  insert into public.course_purchases (contact_id, course_id, workspace_id, contact_department_id, price, status, enrolled_by)
  values (v_contact_id, p_course_id, v_workspace_id, p_department_id, p_price, 'completed', p_caller)
  on conflict (contact_department_id) where contact_department_id is not null
  do update set
    contact_id = excluded.contact_id,
    course_id = excluded.course_id,
    workspace_id = excluded.workspace_id,
    price = excluded.price,
    status = 'completed',
    enrolled_by = excluded.enrolled_by,
    created_at = now()
  returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;

-- Rollback: להחזיר את ההגדרה הישנה (migration 0150) - insert רגיל בלי
-- on conflict, אם אי-פעם יהיה צורך לבטל את התיקון הזה:
--
-- create or replace function public.convert_lead_to_purchase(
--   p_department_id uuid, p_course_id uuid, p_price numeric, p_caller uuid, p_won_stage text
-- )
-- returns uuid
-- language plpgsql as $$
-- declare
--   v_contact_id uuid;
--   v_workspace_id uuid;
--   v_purchase_id uuid;
-- begin
--   select contact_id, workspace_id into v_contact_id, v_workspace_id
--   from public.contact_departments
--   where id = p_department_id
--   for update;
--
--   if v_contact_id is null then
--     raise exception 'lead not found';
--   end if;
--
--   update public.contact_departments
--   set stage = p_won_stage, last_activity_at = now()
--   where id = p_department_id;
--
--   insert into public.course_purchases (contact_id, course_id, workspace_id, contact_department_id, price, status, enrolled_by)
--   values (v_contact_id, p_course_id, v_workspace_id, p_department_id, p_price, 'completed', p_caller)
--   returning id into v_purchase_id;
--
--   return v_purchase_id;
-- end;
-- $$;
