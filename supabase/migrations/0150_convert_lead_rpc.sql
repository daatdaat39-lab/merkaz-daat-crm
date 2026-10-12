-- שלב 3 ממודול מכירות/שירות: כפתור "המרה" במסך-הליד - פעולה אחת
-- (RPC, לא שתי כתיבות נפרדות מהלקוח) שמעדכנת contact_departments.stage
-- לשלב-ניצחון ויוצרת שורת course_purchases, כדי ששתי הפעולות יקרו
-- יחד-או-בכלל-לא (כמו lock_lead/0148, לא כמו updateLeadStage הרגיל
-- שמסתמך על כתיבה בודדת ולא זקוק לאטומיות דומה).
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
  returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;
