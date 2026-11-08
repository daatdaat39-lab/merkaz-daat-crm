-- מערכת-טפסים-בסיסית: מאחדת course_registration_questions +
-- course_document_requirements לרשימה-אחת-מסודרת-עם-type, + מוסיפה
-- type='signature' כסמן-מיקום (המימוש-בפועל-של-חתימה נשאר-ב-
-- lead_conversion_checklist, migration 0181 - לא-נבנה-מחדש).
create table public.course_form_fields (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  field_key text not null,
  label text not null,
  type text not null default 'text' check (type in ('text','number','date','select','file','signature')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (course_id, field_key)
);
create index on public.course_form_fields(course_id, sort_order);
alter table public.course_form_fields enable row level security;
create policy "course_form_fields_all_authenticated" on public.course_form_fields for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- מיגרציית-נתונים: שומרים על-אותו-id (לא gen_random_uuid() חדש) כדי-ש-
-- contact_documents.requirement_id הקיים (כבר-יש-שורת-בדיקה-אמיתית!)
-- ימשיך-להצביע-נכון בלי-שום-שינוי-בטבלת contact_documents עצמה.
insert into public.course_form_fields (id, course_id, field_key, label, type, options, required, sort_order, is_active, created_at)
select id, course_id, field_key, label, type, options, required, sort_order, is_active, created_at
from public.course_registration_questions
on conflict (course_id, field_key) do nothing;

insert into public.course_form_fields (id, course_id, field_key, label, type, required, sort_order, is_active, created_at)
select id, course_id, 'doc_' || substr(id::text, 1, 8), label, 'file', required, sort_order + 1000, is_active, created_at
from public.course_document_requirements
on conflict (course_id, field_key) do nothing;

-- שדה-חתימה-ממוקם-בסוף (ברירת-מחדל, ניתן-לגרירה-מחדש בעתיד) - רק-
-- לקורסים-שכבר-הדליקו checklist_signatures_enabled (לא-שוברים-קורסים
-- שכיבו-את-זה-במפורש).
insert into public.course_form_fields (course_id, field_key, label, type, required, sort_order, is_active)
select id, 'signature', 'חתימה', 'signature', true, 9999, true
from public.courses
where checklist_signatures_enabled is not false;

-- עדכון-ה-FK: contact_documents.requirement_id מצביע-מעכשיו ל-
-- course_form_fields (לא-לטבלה-הישנה) - בטוח כי-כל-ה-id-ים-הישנים
-- הועתקו-זהים למעלה. course_registration_questions/
-- course_document_requirements **לא-נמחקות** בשלב-זה - נשארות-כגיבוי-
-- קריאה-בלבד, ננקה-בהמשך אחרי-שהכל-מאומת-יציב.
alter table public.contact_documents drop constraint if exists contact_documents_requirement_id_fkey;
alter table public.contact_documents add constraint contact_documents_requirement_id_fkey
  foreign key (requirement_id) references public.course_form_fields(id) on delete set null;
