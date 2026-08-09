-- מסך הגדרות "מקורות לידים" - שלושה חלקים:
-- 1. campaign_id על email_connections - מאפשר לקמפיין להיות בעל תיבת
--    מייל נכנס משלו (בנוסף לתיבת ברירת המחדל של המחלקה, שממשיכה
--    להיות אחת בלבד). NULL = תיבת ברירת המחדל של המחלקה (ההתנהגות
--    הקיימת). מגביל ל-1 תיבה לכל מחלקה (כמו היום) + 1 תיבה לכל קמפיין,
--    בעזרת שני אינדקסים חלקיים במקום unique(workspace_id, purpose)
--    הישן - כי NULL לא נחשב שווה ל-NULL אחר במגבלת unique רגילה.
alter table public.email_connections
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

alter table public.email_connections drop constraint if exists email_connections_workspace_purpose_key;

create unique index if not exists email_connections_workspace_purpose_default_key
  on public.email_connections(workspace_id, purpose) where campaign_id is null;
create unique index if not exists email_connections_campaign_purpose_key
  on public.email_connections(campaign_id, purpose) where campaign_id is not null;

-- 2. שיוך קמפיין לתיבת מייל קיימת של המחלקה + כלל ניתוב אופציונלי -
-- כשקמפיין לא מחובר לתיבה משלו (campaign_id null למעלה) אלא משתמש
-- בתיבת ברירת המחדל המשותפת של המחלקה, route_match_text מסנן אילו
-- מיילים מתוך התיבה המשותפת משויכים לקמפיין הזה ספציפית.
alter table public.campaigns
  add column if not exists email_connection_id uuid references public.email_connections(id) on delete set null,
  add column if not exists route_match_text text;

-- 3. רשימת מקורות לידים לפי מחלקה - מחליף את המיפוי הקשיח בקוד
-- (sourceLinks.js) שהיה לו ערך יחיד גלובלי בלבד.
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  link_pattern text,
  created_at timestamptz not null default now()
);
create index if not exists lead_sources_workspace_idx on public.lead_sources(workspace_id);

alter table public.lead_sources enable row level security;
create policy "lead_sources_all_authenticated" on public.lead_sources
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
