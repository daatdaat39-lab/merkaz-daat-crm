-- ============================================================
-- Migration: תבניות מייל מוכנות מראש לשליחה מהירה מהכרטיס - בדומה
-- לתבניות WhatsApp.
-- ============================================================

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "email_templates_all_authenticated" on public.email_templates;
create policy "email_templates_all_authenticated"
  on public.email_templates for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
