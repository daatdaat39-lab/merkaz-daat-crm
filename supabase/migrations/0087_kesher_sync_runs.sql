-- לוג ריצות סנכרון-קשר - משמש בעיקר כדי לדעת "מתי סנכרנו לאחרונה" ולמלא
-- אוטומטית את "מתאריך" בפעם הבאה (מהתאריך האחרון שסונכרן ועד היום, לא
-- טווח קבוע), במקום שהמשתמש יזכור/יחשב את זה ידנית בכל פעם.
create table if not exists public.kesher_sync_runs (
  id uuid primary key default gen_random_uuid(),
  from_date date not null,
  to_date date not null,
  run_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  transactions_created int not null default 0,
  transactions_skipped int not null default 0,
  transactions_unmatched int not null default 0,
  obligations_created int not null default 0,
  obligations_updated int not null default 0,
  obligations_unmatched int not null default 0
);
create index if not exists kesher_sync_runs_run_at_idx on public.kesher_sync_runs(run_at desc);
alter table public.kesher_sync_runs enable row level security;
create policy "kesher_sync_runs_all_authenticated" on public.kesher_sync_runs for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
