-- דגל-הפעלה רביעי (checklist_documents_enabled, אותו-דפוס-בדיוק כמו
-- 3 הדגלים הקיימים ב-migration 0173) + רשימת-דרישות-מסמכים גמישה
-- לכל-קורס, אותו-דפוס-בדיוק כמו course_registration_questions
-- (migration 0177) - בלי field_key/type/options, כי מסמך הוא
-- קובץ-מצורף, לא שדה-מילוי. + קישור-חיצוני-לדף-התשלום (מאוחסן
-- מחוץ-למערכת, ב-Kesher) - seed חד-פעמי לשורת-צ'קליסט חדשה, לא
-- מסונכרן-חי, אותו-דפוס-בדיוק כמו registration_form_url/
-- signature_template_url (migration 0175).

alter table public.courses
  add column if not exists checklist_documents_enabled boolean not null default true,
  add column if not exists payment_page_url text;

create table if not exists public.course_document_requirements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  label text not null,
  required boolean not null default false,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists course_document_requirements_course_idx
  on public.course_document_requirements(course_id, sort_order);

alter table public.course_document_requirements enable row level security;

drop policy if exists "course_document_requirements_all_authenticated" on public.course_document_requirements;
create policy "course_document_requirements_all_authenticated" on public.course_document_requirements for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
