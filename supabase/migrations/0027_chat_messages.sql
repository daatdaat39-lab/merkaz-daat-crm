-- ============================================================
-- Migration: צ'אט פנימי - ערוץ אחד משותף לכל מחלקה (workspace), עם
-- עדכון בזמן אמת (Supabase Realtime) כדי שהודעות יופיעו אצל כולם מיד.
-- ============================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_workspace_idx on public.chat_messages(workspace_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_all_authenticated" on public.chat_messages;
create policy "chat_messages_all_authenticated"
  on public.chat_messages for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

alter publication supabase_realtime add table public.chat_messages;
