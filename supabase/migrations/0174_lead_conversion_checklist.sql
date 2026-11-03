-- שלב ב' ב"מסלול-הצלחה מורחב": רשומת-צ'קליסט-המרה אחת-לכל-ליד (1:1 עם
-- contact_department_id) - שלב-ביניים-תיעודי לפני ה-RPC convert_lead_to_purchase
-- הקיים (מיגרציה 0150, לא נוגעים בו). תלוי במיגרציה 0173 (courses.checklist_*,
-- course_tracks) שחייבת לרוץ קודם.

create table if not exists public.lead_conversion_checklist (
  id uuid primary key default gen_random_uuid(),
  contact_department_id uuid not null unique references public.contact_departments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  track_id uuid references public.course_tracks(id) on delete set null,

  forms_link text,
  forms_done boolean not null default false,
  forms_done_at timestamptz,

  payment_total_amount numeric,
  payment_installments_count int default 1,
  payment_method text,
  payment_note text,
  payment_arranged boolean not null default false,
  payment_arranged_at timestamptz,

  signatures_done boolean not null default false,
  signatures_done_at timestamptz,
  signatures_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create unique index if not exists lead_conversion_checklist_department_idx
  on public.lead_conversion_checklist(contact_department_id);

alter table public.lead_conversion_checklist enable row level security;

drop policy if exists "lead_conversion_checklist_all_authenticated" on public.lead_conversion_checklist;
create policy "lead_conversion_checklist_all_authenticated" on public.lead_conversion_checklist for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
