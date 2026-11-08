-- מנגנון-מסמכים-אחד-לכל-המערכת (לא-רק-לליד-בודד): contact_id הוא-ה-FK
-- היחיד-חובה. contact_department_id/requirement_id אופציונליים -
-- "לאיזה-תהליך זה-שייך, אם-בכלל" - מאפשר גם-מסמך-כללי (טאב "מסמכים"
-- הכללי בכרטיס-איש-קשר, שהיה-עד-היום placeholder-מת-לגמרי) וגם-מסמך
-- שקשור-לליד-קורס-ספציפי (צ'קליסט-ההרשמה), **באותה-טבלה-בדיוק**.
create table if not exists public.contact_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  contact_department_id uuid references public.contact_departments(id) on delete set null,
  requirement_id uuid references public.course_document_requirements(id) on delete set null,
  category text,
  file_path text not null,
  original_filename text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

create index if not exists contact_documents_contact_idx on public.contact_documents(contact_id);
create index if not exists contact_documents_department_idx on public.contact_documents(contact_department_id);

alter table public.contact_documents enable row level security;

drop policy if exists "contact_documents_all_authenticated" on public.contact_documents;
create policy "contact_documents_all_authenticated" on public.contact_documents for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- bucket פרטי יחיד (לא ציבורי כמו contact-photos) - ת.ז/מסמכים-אישיים
-- רגישים-יותר מתמונת-פרופיל. כל-גישה (נציג+קישור-ציבורי-עתידי) תמיד
-- דרך admin-client + createSignedUrl, לעולם-לא getPublicUrl - בלי
-- מדיניות storage.objects נפרדת, הכל-נאכף-באפליקציה.
insert into storage.buckets (id, name, public)
values ('contact-documents', 'contact-documents', false)
on conflict (id) do nothing;
