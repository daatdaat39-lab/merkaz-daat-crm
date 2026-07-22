-- ============================================================
-- Migration: יומן שינויים (audit log) לפעולות ניהול על איש קשר -
-- הקפאה/הפשרה, מיזוג כפילויות, הסרה ממחלקה, מחיקה. contact_id בלי
-- foreign key לטבלת contacts (בכוונה) - כדי שרשומת "נמחק" תישאר בעינה
-- גם אחרי שהכרטיס עצמו כבר לא קיים; contact_name הוא צילום מצב של
-- השם בזמן הפעולה, לא lookup חי.
-- ============================================================

create table if not exists public.contact_audit_log (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  contact_name text not null,
  action text not null,
  detail text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contact_audit_log_contact_id_idx on public.contact_audit_log (contact_id, created_at desc);

alter table public.contact_audit_log enable row level security;

drop policy if exists "contact_audit_log_all_authenticated" on public.contact_audit_log;
create policy "contact_audit_log_all_authenticated"
  on public.contact_audit_log for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
