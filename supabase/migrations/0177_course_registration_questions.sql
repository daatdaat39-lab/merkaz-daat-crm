-- שאלות-רישום דינמיות לכל קורס (תוכן, לא רק-תהליך) - רשימה גמישה
-- שמנהל מגדיר בהגדרות->קטלוג-קורסים, אותו-דפוס-בדיוק כמו
-- workspace_extra_fields (migration 0043) + is_active כמו course_tracks
-- (migration 0173, השבתה-בלבד, בלי-מחיקה-קשה).

create table if not exists public.course_registration_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  field_key text not null,
  label text not null,
  type text not null default 'text', -- text | select | number | date
  options jsonb not null default '[]'::jsonb, -- ל-type='select' בלבד
  required boolean not null default false,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (course_id, field_key)
);

create index if not exists course_registration_questions_course_idx
  on public.course_registration_questions(course_id, sort_order);

alter table public.course_registration_questions enable row level security;

drop policy if exists "course_registration_questions_all_authenticated" on public.course_registration_questions;
create policy "course_registration_questions_all_authenticated" on public.course_registration_questions for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- תשובות-הליד לשאלות-הקורס - {field_key: value} - חי על שורת-הצ'קליסט
-- (1:1 עם contact_department_id, כלומר עם רישום-הקורס-הספציפי הזה, לא
-- עם המחלקה הכללית) - תואם למודל "ליד-פר-קורס" הקיים.
alter table public.lead_conversion_checklist
  add column if not exists registration_answers jsonb not null default '{}'::jsonb;
