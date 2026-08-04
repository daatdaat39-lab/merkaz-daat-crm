-- תהליך (pipeline) לכל קמפיין בנפרד - מחליף את הסטטוס השטוח הקבוע
-- (רק 'pending'/'done') ב-campaign_contacts.status בשלבים מותאמים
-- אישית לכל קמפיין, באותה רוח בדיוק כמו pipeline_stages (מיגרציה
-- 0036) שכבר עשתה את זה לשלבי המחלקות. עותק מפושט - בלי
-- is_lead_stage/is_side_stage, קמפיין לא צריך את ההבחנה הזו.
--
-- לא רלוונטי לקמפיין ההקדשות (kind='dedication') - הוא מבנית לא
-- משתמש ב-status/category בכלל (הענף שלו ב-CampaignDetailClient.js
-- אף פעם לא נוגע בעמודות האלה), אז הוא לא מקבל שלבים כלל - גם כאן
-- בזריעה וגם באכיפה בקוד (stages/actions.js בודק campaigns.kind).
create table if not exists public.campaign_stages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  stage_key text not null,
  label text not null,
  color_bg text not null default '#f4f4f5',
  color_fg text not null default '#52525b',
  sort_order int,
  is_won_stage boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_id, stage_key)
);
create index if not exists campaign_stages_campaign_order_idx
  on public.campaign_stages(campaign_id, sort_order);

alter table public.campaign_stages enable row level security;
drop policy if exists "campaign_stages_all_authenticated" on public.campaign_stages;
create policy "campaign_stages_all_authenticated" on public.campaign_stages for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- זריעת ברירת מחדל: אותם שני שלבים שהיו קבועים בקוד עד עכשיו
-- ('ממתין'/'טופל'), לכל קמפיין קיים היום שאינו קמפיין הקדשות - כך
-- שהמעבר לא ישנה שום דבר בפועל עד שמנהל בוחר להתאים אישית.
insert into public.campaign_stages (campaign_id, stage_key, label, color_bg, color_fg, sort_order, is_won_stage)
select c.id, v.stage_key, v.label, v.color_bg, v.color_fg, v.sort_order, v.is_won
from public.campaigns c, (values
  ('pending', 'ממתין', '#fffbeb', '#d97706', 0, false),
  ('done', 'טופל', '#f0fdf4', '#16a34a', 1, true)
) as v(stage_key, label, color_bg, color_fg, sort_order, is_won)
where c.kind <> 'dedication'
  and not exists (select 1 from public.campaign_stages s where s.campaign_id = c.id and s.stage_key = v.stage_key);
