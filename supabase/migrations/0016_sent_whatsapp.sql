-- ============================================================
-- Migration: תיעוד הודעות WhatsApp שנשלחו מתוך המערכת לאנשי קשר -
-- מוצג בטאב "פעילות" בכרטיס איש הקשר, בדומה ל-sent_emails.
-- ============================================================

create table if not exists public.sent_whatsapp (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone text not null,
  reason text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);

alter table public.sent_whatsapp enable row level security;

drop policy if exists "sent_whatsapp_all_authenticated" on public.sent_whatsapp;
create policy "sent_whatsapp_all_authenticated"
  on public.sent_whatsapp for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
