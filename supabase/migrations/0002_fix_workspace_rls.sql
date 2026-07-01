-- ============================================================
-- Migration: תיקון בעיית recursion ב-RLS של workspace_members
-- ============================================================

-- פונקציית עזר שבודקת חברות ב-workspace בלי לגרום ל-recursion
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
  );
$$;

-- פונקציית עזר דומה, לבדיקת הרשאת owner/admin (לשימוש עתידי)
create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- מחליפים את ה-policies הבעייתיות לשימוש בפונקציות החדשות
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select
  using ( public.is_workspace_member(id) );

drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using ( public.is_workspace_member(workspace_id) );

drop policy if exists "workspace_members_insert_admin" on public.workspace_members;
create policy "workspace_members_insert_admin"
  on public.workspace_members for insert
  with check ( public.is_workspace_admin(workspace_id) );
