-- שלבי pipeline דינמיים לכל מחלקה - מחליף את PIPELINES/STAGE_LABELS/
-- STAGE_COLORS הקבועים בקוד (pipelines.js). כל מחלקה מקבלת שורה per
-- שלב; sort_order קובע את סדר ה-funnel הליניארי, is_lead_stage/
-- is_won_stage מחליפים leadStages[]/wonStage, ו-is_side_stage מסמן
-- שלבים "מחוץ לרצף" (סגור/תקלה בחיוב) שתמיד מוצגים כשבב נפרד בסוף
-- השורה (sort_order נשאר null עבורם).
--
-- ייחודיות stage_key היא per-workspace, (workspace_id, stage_key) - לא
-- גלובלית. בפועל דעת למדני ודעת ותבונה כבר חולקות מפתחות זהים היום
-- (new_lead/open/meeting/registering/registered/graduate/closed - אותו
-- מפתח, אותה תווית, אותו צבע באובייקטי STAGE_LABELS/STAGE_COLORS
-- הקבועים הישנים), וגם contact_departments.stage הקיים בפועל מכיל את
-- המחרוזות המקוריות האלה לאנשי קשר קיימים בשתי המחלקות. ייחודיות
-- גלובלית הייתה מחייבת לשנות בדיעבד את stage השמור לאנשי קשר קיימים
-- כדי להתאים למפתחות חדשים - סיכון מיותר לשינוי שאמור להיות שקוף
-- לגמרי. הזריעה למטה משתמשת באותם מפתחות מקוריים בדיוק בכל מחלקה,
-- כך שהמעבר לא ישנה שום דבר בפועל. (מקרה הקצה של שתי מחלקות עם תווית
-- שונה לאותו מפתח - שלא קיים היום - מתועד בתוכנית כסיכון ידוע ומקובל.)
--
-- עריכה: owner/admin בלבד, דרך הגדרות ← שלבי pipeline.
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage_key text not null,
  label text not null,
  color_bg text not null default '#f4f4f5',
  color_fg text not null default '#52525b',
  sort_order int,
  is_lead_stage boolean not null default false,
  is_won_stage boolean not null default false,
  is_side_stage boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, stage_key)
);
create index if not exists pipeline_stages_workspace_order_idx
  on public.pipeline_stages(workspace_id, sort_order);

alter table public.pipeline_stages enable row level security;
drop policy if exists "pipeline_stages_all_authenticated" on public.pipeline_stages;
create policy "pipeline_stages_all_authenticated" on public.pipeline_stages for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- זריעת כל השלבים הקיימים היום, בערכים זהים למה שהיה קבוע בקוד (כולל
-- מפתחות זהים חוצי-מחלקות היכן שכך היה במקור) - כדי שהמעבר לא ישנה שום
-- דבר בפועל בהתנהגות המערכת או בהתאמה לנתונים קיימים ב-contact_departments.
insert into public.pipeline_stages (workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage)
select w.id, v.stage_key, v.label, v.color_bg, v.color_fg, v.sort_order, v.is_lead, v.is_won, v.is_side
from public.workspaces w, (values
  ('דעת למדני','new_lead','ליד חדש','#eff6ff','#2563eb',0,true,false,false),
  ('דעת למדני','open','פתוח','#eff6ff','#2563eb',1,true,false,false),
  ('דעת למדני','meeting','פגישה','#f5f3ff','#7c3aed',2,true,false,false),
  ('דעת למדני','registering','בתהליך הרשמה','#fffbeb','#d97706',3,false,false,false),
  ('דעת למדני','registered','נרשם','#f0fdf4','#16a34a',4,false,false,false),
  ('דעת למדני','started','התחיל לימודים','#f0fdf4','#16a34a',5,false,false,false),
  ('דעת למדני','graduate','בוגר','#ecfdf5','#0d9488',6,false,true,false),
  ('דעת למדני','closed','סגור / לא רלוונטי','#fef2f2','#dc2626',null,false,false,true),
  ('דעת ותבונה','new_lead','ליד חדש','#eff6ff','#2563eb',0,true,false,false),
  ('דעת ותבונה','open','פתוח','#eff6ff','#2563eb',1,true,false,false),
  ('דעת ותבונה','meeting','פגישה','#f5f3ff','#7c3aed',2,true,false,false),
  ('דעת ותבונה','registering','בתהליך הרשמה','#fffbeb','#d97706',3,false,false,false),
  ('דעת ותבונה','registered','נרשם','#f0fdf4','#16a34a',4,false,false,false),
  ('דעת ותבונה','active_student','תלמיד פעיל','#f0fdf4','#16a34a',5,false,false,false),
  ('דעת ותבונה','graduate','בוגר','#ecfdf5','#0d9488',6,false,true,false),
  ('דעת ותבונה','closed','סגור / לא רלוונטי','#fef2f2','#dc2626',null,false,false,true),
  ('תרומות','potential','פוטנציאל','#f4f4f5','#52525b',0,true,false,false),
  ('תרומות','no_contact_yet','טרם נוצר קשר','#f4f4f5','#52525b',1,true,false,false),
  ('תרומות','contacted','נוצר קשר','#f5f3ff','#7c3aed',2,true,false,false),
  ('תרומות','call','שיחה','#f5f3ff','#7c3aed',3,false,false,false),
  ('תרומות','offer','הצעה','#fffbeb','#d97706',4,false,false,false),
  ('תרומות','committed','התחייבות לתרומה','#fffbeb','#d97706',5,false,false,false),
  ('תרומות','donated','תרם','#f0fdf4','#16a34a',6,false,false,false),
  ('תרומות','active_donor','תורם פעיל','#ecfdf5','#0d9488',7,false,true,false),
  ('תרומות','closed','סגור / לא רלוונטי','#fef2f2','#dc2626',null,false,false,true),
  ('תרומות','credit_issue','תקלה בחיוב / אשראי נכשל','#fef2f2','#dc2626',null,false,false,true)
) as v(ws_name, stage_key, label, color_bg, color_fg, sort_order, is_lead, is_won, is_side)
where w.name = v.ws_name
  and not exists (select 1 from public.pipeline_stages p where p.workspace_id = w.id and p.stage_key = v.stage_key);

-- ============================================================
-- הקדשות כקמפיין: kind מבחין קמפיין "לוח שנה והקדשות" (evergreen,
-- אחד בלבד, תחת מחלקת תרומות) מקמפיין פעולה רגיל (ברירת המחדל,
-- לא משנה שורות קיימות). metadata גנרי לשימוש עתידי של סוגי קמפיין
-- נוספים - הקדשות לא ישתמשו בו (צריך ריבוי שורות, לא ערך יחיד - ר'
-- campaign_dedication_entries למטה).
-- ============================================================
alter table public.campaigns add column if not exists kind text not null default 'outreach';
alter table public.campaign_contacts add column if not exists metadata jsonb not null default '{}';

-- טבלת בת: כל שורה = תאריך+נוסח הקדשה אחד, תחת שיוך של איש קשר לקמפיין
-- ההקדשות (campaign_contacts.id). ריבוי שורות per campaign_contact תומך
-- בכמה תאריכים שונים לאותו איש קשר (למשל שני יארצייטים).
create table if not exists public.campaign_dedication_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_contact_id uuid not null references public.campaign_contacts(id) on delete cascade,
  dedication_date date not null,
  dedication_text text not null,
  note text,
  names text[] not null default '{}',
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaign_dedication_entries_date_idx
  on public.campaign_dedication_entries(dedication_date);
create index if not exists campaign_dedication_entries_membership_idx
  on public.campaign_dedication_entries(campaign_contact_id);

alter table public.campaign_dedication_entries enable row level security;
drop policy if exists "campaign_dedication_entries_all_authenticated" on public.campaign_dedication_entries;
create policy "campaign_dedication_entries_all_authenticated" on public.campaign_dedication_entries for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- זריעת קמפיין "לוח שנה והקדשות" היחיד תחת תרומות, אם עוד לא קיים
insert into public.campaigns (workspace_id, name, kind, status)
select w.id, 'לוח שנה והקדשות', 'dedication', 'active'
from public.workspaces w
where w.name = 'תרומות'
  and not exists (select 1 from public.campaigns c where c.workspace_id = w.id and c.kind = 'dedication');

-- הערה: אין כאן drop של calendar_dedications במכוון - זה קורה במיגרציה
-- הרסנית נפרדת (0038) רק אחרי שכל הקוד עבר לקרוא/לכתוב לטבלאות החדשות.
