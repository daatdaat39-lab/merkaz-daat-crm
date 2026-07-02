-- Fix: grant the actual CEO user (ceo@test.com) owner access to all department workspaces

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'owner'
from public.workspaces w
cross join auth.users u
where u.email = 'ceo@test.com'
  and w.name in (
    U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9',
    U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4',
    U&'\05EA\05E8\05D5\05DE\05D5\05EA'
  )
on conflict (workspace_id, user_id) do update set role = 'owner';
