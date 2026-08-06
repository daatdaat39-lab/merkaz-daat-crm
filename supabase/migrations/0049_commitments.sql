-- התחייבויות (pledges) - קונספט גנרי לכל מחלקה, לא רק תרומות. תורם/
-- איש קשר מתחייב לסכום כולל, אופציונלית בכמה תשלומים, והמערכת עוקבת
-- כמה שולם בפועל מול donation_transactions אמיתיות (SUM בזמן אמת, לא
-- עמודת מטמון - ר' commitmentsActions.js). installments_count הוא
-- תיאורי בלבד, לא קובע את חישוב היתרה.
create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  total_amount numeric not null check (total_amount > 0),
  installments_count int not null default 1 check (installments_count >= 1),
  status text not null default 'active' check (status in ('active', 'fulfilled', 'cancelled')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists commitments_contact_idx on public.commitments(contact_id);
create index if not exists commitments_workspace_idx on public.commitments(workspace_id);
create index if not exists commitments_status_idx on public.commitments(status);

alter table public.commitments enable row level security;

create policy "commitments_all_authenticated" on public.commitments
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- קישור אופציונלי של תנועה קיימת להתחייבות ספציפית - nullable כי רוב
-- התנועות (ייבוא רגיל) לא קשורות לשום התחייבות.
alter table public.donation_transactions
  add column if not exists commitment_id uuid references public.commitments(id) on delete set null;

create index if not exists donation_transactions_commitment_idx
  on public.donation_transactions(commitment_id);
