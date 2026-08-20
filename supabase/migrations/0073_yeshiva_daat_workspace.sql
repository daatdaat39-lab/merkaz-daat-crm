-- ============================================================
-- Migration: מחלקה רביעית "ישיבת דעת"
-- אותו דפוס בדיוק כמו 0004_department_workspaces.sql, בלי שיוך
-- אנשי-קשר קיימים (אין contacts עם dept מתאים - מחלקה חדשה וריקה,
-- תתמלא בייבוא נפרד של בוגרי הישיבה).
-- ============================================================
do $$
declare
  main_ws_id uuid;
  ws_yeshiva uuid;
  super_admin_id uuid;
begin
  select id into main_ws_id from public.workspaces order by created_at asc limit 1;

  if not exists (select 1 from public.workspaces where name = 'ישיבת דעת') then
    insert into public.workspaces (name, created_by) values ('ישיבת דעת', null) returning id into ws_yeshiva;
  else
    select id into ws_yeshiva from public.workspaces where name = 'ישיבת דעת';
  end if;

  -- ה-super-admin הראשי (ה-owner הראשון של ה-workspace הראשי) מקבל owner גם כאן
  select user_id into super_admin_id
  from public.workspace_members
  where workspace_id = main_ws_id and role = 'owner'
  order by created_at asc
  limit 1;

  if super_admin_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_yeshiva, super_admin_id, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';
  end if;
end $$;
