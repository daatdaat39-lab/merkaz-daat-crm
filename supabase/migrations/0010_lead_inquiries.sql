-- ============================================================
-- Migration: היסטוריית פניות לכל שיוך מחלקה - "מהות הפנייה" נשמרת בנפרד
-- לכל פנייה (לא נמחקת/נדרסת בפנייה הבאה), כדי שתישאר היסטוריה מלאה.
-- ============================================================

create table if not exists public.lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_department_id uuid not null references public.contact_departments(id) on delete cascade,
  reason text not null,
  note text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.lead_inquiries enable row level security;

drop policy if exists "lead_inquiries_all_authenticated" on public.lead_inquiries;
create policy "lead_inquiries_all_authenticated"
  on public.lead_inquiries for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

-- לכל שיוך מחלקה קיים שעדיין אין לו אף פנייה רשומה - יוצר פנייה ראשונית
-- כדי שלא יישארו שיוכים בלי היסטוריה כלל
insert into public.lead_inquiries (contact_department_id, reason, created_at)
select cd.id, 'פנייה ראשונית (לפני התכונה)', cd.created_at
from public.contact_departments cd
where not exists (select 1 from public.lead_inquiries li where li.contact_department_id = cd.id);
