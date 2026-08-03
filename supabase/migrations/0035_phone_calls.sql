-- שיחות טלפון אמיתיות מ-hallo015 (מערכת 015) - מתקבלות דרך webhook
-- (Hangup event) ולא ידנית. external_call_id ייחודי מונע רישום כפול אם
-- 015 שולחים את אותו webhook פעמיים. מספרי המקור/היעד נשמרים גם גולמיים
-- (snumber/dnumber) כי לא תמיד ברור מראש מי מהם הצד החיצוני.
create table if not exists public.phone_calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  external_call_id text unique,
  direction text,
  snumber text,
  dnumber text,
  extension text,
  status text,
  answered boolean,
  duration_seconds int,
  recording_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_calls_contact_idx on public.phone_calls(contact_id, started_at desc);

alter table public.phone_calls enable row level security;
drop policy if exists "phone_calls_all_authenticated" on public.phone_calls;
create policy "phone_calls_all_authenticated" on public.phone_calls for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
