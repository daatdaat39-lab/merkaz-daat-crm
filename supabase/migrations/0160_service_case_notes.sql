-- הערות/סיכום-שיחה לקריאת-שירות - אין טבלה מתאימה-לשימוש-חוזר
-- (lead_inquiries שייכת ל-contact_departments, לא ל-service_cases, ושימוש
-- בה כאן היה מייחס את ההערה למחלקה הלא-נכונה). created_by נשמר (בניגוד
-- ל-lead_inquiries) כי קריאת-שירות עוברת בין כמה נציגים בפועל (העברה/
-- שינוי-נציג) - חשוב לדעת מי כתב כל הערה.
create table if not exists public.service_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.service_cases(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists service_case_notes_case_id_idx on public.service_case_notes(case_id, created_at);

alter table public.service_case_notes enable row level security;
drop policy if exists "service_case_notes_all_authenticated" on public.service_case_notes;
create policy "service_case_notes_all_authenticated" on public.service_case_notes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
