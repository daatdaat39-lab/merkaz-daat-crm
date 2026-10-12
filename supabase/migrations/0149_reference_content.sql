-- שלב 2 ממודול מכירות/שירות: תוכן-עזר (תסריטי-מכירה + מאגר-ידע) -
-- טבלה אחת עם kind ('playbook'/'kb'), לא שתיים - אותה צורה בדיוק
-- (כותרת/גוף/קורס/מיון), נקראת ע"י אותו סוג-UI (אקורדיון) בשני המסכים
-- החדשים (שלבים 3-4). course_id=null = חל על כל הקורסים. tag מאפשר
-- סינון לפי סוג-התנגדות ("יקר לי") או סוג-תקלה - בלי זה אי-אפשר לסנן
-- כמו שהתבקש. בלי workspace_id - kind כבר מבדיל מכירות משירות.
create table if not exists public.reference_content (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('playbook', 'kb')),
  course_id uuid references public.courses(id) on delete cascade,
  tag text,
  title text not null,
  body text not null,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reference_content_kind_course_idx on public.reference_content(kind, course_id);
alter table public.reference_content enable row level security;
drop policy if exists "reference_content_all_authenticated" on public.reference_content;
create policy "reference_content_all_authenticated" on public.reference_content for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
