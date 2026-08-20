-- טבלת-ילד "הרשמה לקורס" - one-to-many אמיתי (בשונה מ-workspace_extra_fields
-- שהוא ערך יחיד לאיש-קשר) - אותו דפוס בדיוק כמו contact_call_history
-- (0032). מפתח ייחודי טבעי (contact_id, year_label, course_code) - לא
-- external_row_key סינתטי כמו contact_call_history - כי כאן המפתח הטבעי
-- כבר קיים וברור (איזה איש קשר, איזו שנה, איזה קורס) ברגע ש-contact_id
-- נפתר, ולא צריך להמציא מפתח מרכיבי המקור. שימוש ראשון: ייבוא היסטוריית
-- קורסים מ"אורביט" (מחלקת דעת ותבונה), אבל גנרית לכל מחלקה.
create table if not exists public.contact_course_enrollments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  year_label text not null,
  course_name text,
  course_code text,
  confidence text not null default 'high',
  source text not null default 'אורביט',
  created_at timestamptz not null default now(),
  unique (contact_id, year_label, course_code)
);
create index if not exists contact_course_enrollments_contact_idx on public.contact_course_enrollments(contact_id);
alter table public.contact_course_enrollments enable row level security;
create policy "contact_course_enrollments_all_authenticated" on public.contact_course_enrollments for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
