-- מחלקה חמישית "סמינרים" (אירועי חג בבית מלון - פסח/שבועות/ראש השנה) +
-- טבלת-ילד "השתתפות בסמינר" - one-to-many אמיתי, אותו דפוס בדיוק כמו
-- contact_course_enrollments (0072). כל המידע האמיתי (סוג אירוע, שנה,
-- השתתף/התעניין, הערה חופשית) חי בטבלה הזו, לא ב-contact_departments.stage -
-- אדם יכול "להשתתף בפסח תשפ"ג" וגם "להתעניין בשבועות תשפ"ו" בו-זמנית,
-- ולכן stage יחיד לא מספיק. contact_departments.stage נשאר שלב-צד יחיד
-- ("רשום") רק כדי לסמן חברות במחלקה - לא נעשה בו שימוש משמעותי.
--
-- kind ('participation'/'pledge') מבדיל רשומת השתתפות/התעניינות רגילה
-- מרשומת-נדבה נפרדת (רק בראש השנה תשפ"ד, גיליון "נדבות") - אדם שגם
-- השתתף וגם נדב מקבל שתי שורות נפרדות לאותו event_type+year, לא הערה
-- ממוזגת אחת. confidence ('high'/'low') כמו ב-contact_course_enrollments -
-- 'low' למי שנוצר בלי שום פרט מזהה (טלפון/אימייל) בכלל.
create table if not exists public.contact_seminar_participations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null,
  year text not null,
  kind text not null default 'participation',
  status text not null default 'interested',
  confidence text not null default 'high',
  note text,
  source text not null default 'סמינרים',
  created_at timestamptz not null default now(),
  unique (contact_id, event_type, year, kind)
);
create index if not exists contact_seminar_participations_contact_idx on public.contact_seminar_participations(contact_id);
alter table public.contact_seminar_participations enable row level security;
create policy "contact_seminar_participations_all_authenticated" on public.contact_seminar_participations for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- workspace "סמינרים", אותו דפוס בדיוק כמו 0073 (ישיבת דעת) - מחלקה
-- חדשה וריקה, ה-owner הראשי של המחלקה הראשית מקבל owner כאן גם כן.
do $$
declare
  main_ws_id uuid;
  ws_seminarim uuid;
  super_admin_id uuid;
begin
  select id into main_ws_id from public.workspaces order by created_at asc limit 1;

  if not exists (select 1 from public.workspaces where name = 'סמינרים') then
    insert into public.workspaces (name, created_by) values ('סמינרים', null) returning id into ws_seminarim;
  else
    select id into ws_seminarim from public.workspaces where name = 'סמינרים';
  end if;

  select user_id into super_admin_id
  from public.workspace_members
  where workspace_id = main_ws_id and role = 'owner'
  order by created_at asc
  limit 1;

  if super_admin_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_seminarim, super_admin_id, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';
  end if;
end $$;

-- שלב יחיד "רשום" - אין תהליך/פייפליין משמעותי ברמת המחלקה (כל הפרטים
-- חיים ב-contact_seminar_participations), רק סימון-חברות. במכוון **לא**
-- is_side_stage - חייב להיות לפחות שלב אחד ב-pipeline.order (getPipeline,
-- app/dashboard/lib/pipelines.js) כדי ש-upsertDepartmentMembership's
-- fallback (stage || pipeline.order[0]) לא ייכשל אם אשף הייבוא לא ממפה
-- עמודת stage מפורשת.
insert into public.pipeline_stages (workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage)
select w.id, 'registered', 'רשום', '#f0f9ff', '#0369a1', 0, false, false, false
from public.workspaces w
where w.name = 'סמינרים'
  and not exists (select 1 from public.pipeline_stages p where p.workspace_id = w.id and p.stage_key = 'registered');
