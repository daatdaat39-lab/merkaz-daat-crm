-- שלב א' ב"מסלול-הצלחה מורחב": תשתית-קטלוג לצ'קליסט-ההמרה (3 דגלים
-- קבועים לכל-קורס: טפסים/תשלום/חתימות) + רשימת-מסלולים-גמישה-לכל-קורס
-- (לדוגמה בוקר/ערב/זום). שתי התוספות אדיטיביות-בלבד - אין שינוי-התנהגות
-- לקורסים קיימים עד שמנהל פועל במפורש בהגדרות→קטלוג-קורסים.

alter table public.courses
  add column if not exists checklist_forms_enabled boolean not null default true,
  add column if not exists checklist_payment_enabled boolean not null default true,
  add column if not exists checklist_signatures_enabled boolean not null default true;

create table if not exists public.course_tracks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  label text not null,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists course_tracks_course_idx on public.course_tracks(course_id);

alter table public.course_tracks enable row level security;

drop policy if exists "course_tracks_all_authenticated" on public.course_tracks;
create policy "course_tracks_all_authenticated" on public.course_tracks for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
