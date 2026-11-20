-- ============================================================
-- Migration: "בניית רשימה" - תיעוד חד-כיווני (לא תגית קבועה) של
-- "איש-קשר X נכנס לרשימה Y בתאריך Z" (למשל: פרסום-קורס שנשלח לקבוצה).
-- לא קשור-למחלקה (רשימה יכולה-לחצות-מחלקות) - contact_id בלבד.
-- כניסה-כפולה לאותה-רשימה (למשל נשלח אותו פרסום פעמיים) יוצרת שתי-שורות
-- נפרדות בכוונה - לא upsert/מיזוג.
-- ============================================================

create table if not exists public.contact_list_entries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  list_title text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists contact_list_entries_contact_idx on public.contact_list_entries(contact_id);
create index if not exists contact_list_entries_title_idx on public.contact_list_entries(list_title);

alter table public.contact_list_entries enable row level security;

drop policy if exists "contact_list_entries_all_authenticated" on public.contact_list_entries;
create policy "contact_list_entries_all_authenticated"
  on public.contact_list_entries for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- RPC: find_contact_list_candidates - סינון-בשרת (מהיר, לא "הבא-הכל-
-- וסנן-בדפדפן") למסך "בניית רשימה". נפרד-בכוונה מ-find_campaign_segment_
-- candidates (0083+) - זו לא תלויה-בקמפיין/תרומות, ומיועדת-להיות-כללית.
--
-- עיקרון-הרחבה (לשימוש-עתידי, לפי בקשת-המשתמש "גמיש שנוכל להוסיף
-- סינונים"): כל תנאי-סינון-נוסף הוא פרמטר-אופציונלי-חדש (default null)
-- + שורת "and (p_x is null or ...)" אחת בתוך ה-CTE "base" - בלי לשנות
-- שום-דבר-אחר בפונקציה (לא את ה-signature-הקיים, לא את שאר-הלוגיקה).
-- ============================================================

create or replace function public.find_contact_list_candidates(
  p_source text default null,
  p_stage_workspace_id uuid default null,
  p_stages text[] default null,
  p_course_id uuid default null,
  p_has_course_enrollment boolean default null,
  p_sort_by text default 'name',
  p_sort_dir text default 'asc',
  p_limit int default 200,
  p_offset int default 0
)
returns table(
  contact_id uuid, first text, last text, phone text, email text, source text, tags text[],
  total_row_count bigint
)
language sql stable as $$
  with base as (
    select c.id, c.first, c.last, c.phone, c.email, c.source, c.tags
    from contacts c
    where (p_source is null or c.source = p_source)
      and (p_stage_workspace_id is null or exists (
        select 1 from contact_departments cd
        where cd.contact_id = c.id and cd.workspace_id = p_stage_workspace_id
          and (p_stages is null or cd.stage = any(p_stages))
      ))
      and (p_course_id is null or exists (
        select 1 from course_purchases cp where cp.contact_id = c.id and cp.course_id = p_course_id
      ))
      and (p_has_course_enrollment is null or exists (
        select 1 from course_purchases cp2 where cp2.contact_id = c.id
      ) = p_has_course_enrollment)
  ),
  counted as (
    select *, count(*) over() as total_row_count from base
  )
  select id, first, last, phone, email, source, tags, total_row_count
  from counted
  order by
    case when p_sort_by = 'name' and p_sort_dir = 'desc' then last end desc nulls last,
    case when p_sort_by = 'name' then last end asc nulls last
  limit p_limit offset p_offset;
$$;
