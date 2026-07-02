-- ============================================================
-- Migration: Department workspaces (Daat Lamdani / Daat VeTvuna / Trumot)
-- ============================================================

do $$
declare
  main_ws_id uuid;
  ws_lamdani uuid;
  ws_tvuna uuid;
  ws_trumot uuid;
  super_admin_id uuid;
begin
  -- id of the existing main workspace
  select id into main_ws_id from public.workspaces order by created_at asc limit 1;

  -- create the 3 department workspaces if not already present
  if not exists (select 1 from public.workspaces where name = U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9') then
    insert into public.workspaces (name, created_by) values (U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9', null) returning id into ws_lamdani;
  else
    select id into ws_lamdani from public.workspaces where name = U&'\05D3\05E2\05EA \05DC\05DE\05D3\05E0\05D9';
  end if;

  if not exists (select 1 from public.workspaces where name = U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4') then
    insert into public.workspaces (name, created_by) values (U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4', null) returning id into ws_tvuna;
  else
    select id into ws_tvuna from public.workspaces where name = U&'\05D3\05E2\05EA \05D5\05EA\05D1\05D5\05E0\05D4';
  end if;

  if not exists (select 1 from public.workspaces where name = U&'\05EA\05E8\05D5\05DE\05D5\05EA') then
    insert into public.workspaces (name, created_by) values (U&'\05EA\05E8\05D5\05DE\05D5\05EA', null) returning id into ws_trumot;
  else
    select id into ws_trumot from public.workspaces where name = U&'\05EA\05E8\05D5\05DE\05D5\05EA';
  end if;

  -- move existing contacts (from main workspace) to the matching department by dept field
  update public.contacts
  set workspace_id = ws_lamdani
  where workspace_id = main_ws_id
    and (dept ilike U&'%\05DC\05DE\05D3\05E0\05D9%' or dept ilike U&'%\05DC\05D9\05DE\05D5\05D3%');

  update public.contacts
  set workspace_id = ws_tvuna
  where workspace_id = main_ws_id
    and dept ilike U&'%\05EA\05D1\05D5\05E0\05D4%';

  update public.contacts
  set workspace_id = ws_trumot
  where workspace_id = main_ws_id
    and dept ilike U&'%\05EA\05E8\05D5\05DE%';

  -- anything still left in the main workspace (unrecognized dept) -
  -- defaults to Daat Lamdani, needs manual admin review later
  update public.contacts
  set workspace_id = ws_lamdani
  where workspace_id = main_ws_id;

  -- sync meetings/tasks to the same workspace_id as their linked contact
  update public.meetings m
  set workspace_id = c.workspace_id
  from public.contacts c
  where m.contact_id = c.id
    and m.workspace_id != c.workspace_id;

  update public.tasks t
  set workspace_id = c.workspace_id
  from public.contacts c
  where t.contact_id = c.id
    and t.workspace_id != c.workspace_id;

  -- assign every user with a matching dept as owner of that department workspace
  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_lamdani, id, 'owner' from public.profiles
  where dept ilike U&'%\05DC\05DE\05D3\05E0\05D9%' or dept ilike U&'%\05DC\05D9\05DE\05D5\05D3%'
  on conflict (workspace_id, user_id) do update set role = 'owner';

  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_tvuna, id, 'owner' from public.profiles
  where dept ilike U&'%\05EA\05D1\05D5\05E0\05D4%'
  on conflict (workspace_id, user_id) do update set role = 'owner';

  insert into public.workspace_members (workspace_id, user_id, role)
  select ws_trumot, id, 'owner' from public.profiles
  where dept ilike U&'%\05EA\05E8\05D5\05DE%'
  on conflict (workspace_id, user_id) do update set role = 'owner';

  -- the primary super-admin (first owner of the main workspace) gets owner in all 4 workspaces
  select user_id into super_admin_id
  from public.workspace_members
  where workspace_id = main_ws_id and role = 'owner'
  order by created_at asc
  limit 1;

  if super_admin_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values
      (ws_lamdani, super_admin_id, 'owner'),
      (ws_tvuna, super_admin_id, 'owner'),
      (ws_trumot, super_admin_id, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';
  end if;
end $$;
