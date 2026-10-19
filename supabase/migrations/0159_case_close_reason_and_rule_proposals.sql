-- א. סיבת-סגירה לקריאת-שירות - אותו דפוס בדיוק כמו closed_reason
-- הקיים ל-contact_departments (ליד), ר' picklists list_key='close_reason'.
alter table public.service_cases
  add column if not exists closed_reason text;

insert into public.picklists (workspace_id, list_key, value, sort_order)
select null, 'case_close_reason', v.value, v.ord
from (values
  ('נפתר', 0), ('לא ניתן לשחזר את הבעיה', 1), ('הלקוח לא הגיב', 2), ('כפול', 3), ('אחר', 4)
) as v(value, ord)
where not exists (select 1 from public.picklists where list_key = 'case_close_reason');

-- ג. הצעת-כללים-חדשים מה-AI - שימוש-חוזר ב-reference_content.auto_suggested/
-- approved הקיימים (ממיגרציה 0156, שתוכננו בדיוק לשם כך) + "נדחה" כמצב-קבוע
-- (לא מחיקה) כדי שאותה תבנית לא תוצע שוב בניתוח הבא.
alter table public.reference_content
  add column if not exists rejected boolean not null default false;

-- תיעוד-קל-משקל של אירועי "לא נמצא כלל מתאים" (noMatchingRule), לניתוח-
-- תבניות מאוחר יותר - לא יומן-אינטראקציה מלא, רק המקרים הרלוונטיים.
create table if not exists public.ai_unmatched_events (
  id uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table in ('contact_departments', 'service_cases')),
  source_id uuid not null,
  contact_name text,
  course_id uuid references public.courses(id) on delete set null,
  action_text text,
  created_at timestamptz not null default now()
);
create index if not exists ai_unmatched_events_created_at_idx on public.ai_unmatched_events(created_at);

alter table public.ai_unmatched_events enable row level security;
drop policy if exists "ai_unmatched_events_all_authenticated" on public.ai_unmatched_events;
create policy "ai_unmatched_events_all_authenticated" on public.ai_unmatched_events for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
