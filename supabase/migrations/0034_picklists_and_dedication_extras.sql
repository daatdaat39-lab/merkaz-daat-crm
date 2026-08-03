-- רשימות בחירה דינמיות (סיבות סגירה, סוגי תורם, קטגוריות קמפיין) - מנהל
-- יכול להוסיף/להסיר ערכים מהממשק (הגדרות ← רשימות) בלי צורך בשינוי קוד.
-- workspace_id ריק = רשימה גלובלית (כרגע: סיבות סגירה, משותפות לכל המחלקות).
create table if not exists public.picklists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  list_key text not null,
  value text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists picklists_lookup_idx on public.picklists(list_key, workspace_id, sort_order);

alter table public.picklists enable row level security;
drop policy if exists "picklists_all_authenticated" on public.picklists;
create policy "picklists_all_authenticated" on public.picklists for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- זריעת ברירות המחדל הקיימות (כדי שהמעבר לרשימה דינמית לא ישנה כלום בפועל)
insert into public.picklists (workspace_id, list_key, value, sort_order)
select null, 'close_reason', v.value, v.ord
from (values
  ('לא מעוניין', 0), ('גיל לא מתאים', 1), ('גר באזור מרוחק', 2),
  ('לא עומד בתנאי קבלה', 3), ('בחר מוסד אחר', 4), ('אין מענה', 5), ('אחר', 6)
) as v(value, ord)
where not exists (select 1 from public.picklists where list_key = 'close_reason');

insert into public.picklists (workspace_id, list_key, value, sort_order)
select w.id, 'donor_type', v.value, v.ord
from public.workspaces w, (values ('חדש', 0), ('חוזר', 1)) as v(value, ord)
where w.name = 'תרומות'
  and not exists (select 1 from public.picklists p where p.list_key = 'donor_type' and p.workspace_id = w.id);

insert into public.picklists (workspace_id, list_key, value, sort_order)
select w.id, 'campaign_category', v.value, v.ord
from public.workspaces w, (values ('חם', 0), ('קר', 1), ('תורם בסכום גדול', 2), ('תורם חוזר', 3), ('לא רלוונטי', 4)) as v(value, ord)
where w.name = 'תרומות'
  and not exists (select 1 from public.picklists p where p.list_key = 'campaign_category' and p.workspace_id = w.id);

-- הקדשה משפחתית (כמה שמות תחת אותה הקדשה) ונעילה להדפסה - ברגע שהופקה
-- גרסת הדפסה, ההקדשות שהוצגו בה ננעלות; שחרור דורש owner/admin.
alter table public.calendar_dedications add column if not exists names text[] default '{}';
alter table public.calendar_dedications add column if not exists locked_at timestamptz;
alter table public.calendar_dedications add column if not exists locked_by uuid references auth.users(id) on delete set null;
