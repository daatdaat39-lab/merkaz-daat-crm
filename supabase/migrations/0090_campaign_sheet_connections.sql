-- חיבור Google Sheet לקמפיין - שיתוף-חי דרך גיליון (ולא cron/webhook
-- אוטומטי): לחצן "דחוף לגיליון" מוסיף שורות חדשות, "משוך עדכונים" קורא
-- את הגיליון ומעדכן את הקמפיין. יחס 1:1 לקמפיין (unique על campaign_id).
create table if not exists public.campaign_sheet_connections (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade unique,
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  sheet_title text not null default 'מיפוי',
  refresh_token text not null,
  connected_by uuid references auth.users(id) on delete set null,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.campaign_sheet_connections enable row level security;

create policy "campaign_sheet_connections_all_authenticated" on public.campaign_sheet_connections
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
