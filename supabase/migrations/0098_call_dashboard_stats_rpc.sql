-- אגרגציה בצד-SQL לדשבורד טלמרקטינג (6000+ אנשי קשר, אלפי ניסיונות
-- אפשריים) - group by agent/outcome קורה בפוסטגרס, לא ב-JS אחרי שליפת
-- שורות גולמיות (אותו עיקרון בדיוק כמו find_campaign_segment_candidates -
-- PostgREST לא יודע GROUP BY/HAVING דרך query builder רגיל, ושליפת כל
-- הניסיונות הגולמיים ל-JS הייתה חוזרת על מלכודת-1000-השורות הידועה).
create or replace function public.count_call_attempts_stats(p_campaign_id uuid)
returns table(
  agent_id uuid,
  outcome text,
  attempt_count bigint
)
language sql stable as $$
  select a.agent_id, a.outcome, count(*)
  from public.campaign_call_attempts a
  join public.campaign_contacts cc on cc.id = a.campaign_contact_id
  where cc.campaign_id = p_campaign_id
  group by a.agent_id, a.outcome;
$$;

create or replace function public.get_call_dashboard_totals(p_campaign_id uuid)
returns table(
  total_attempts bigint,
  unique_contacts_attempted bigint,
  remaining_in_queue bigint
)
language sql stable as $$
  select
    (select count(*) from public.campaign_call_attempts a
       join public.campaign_contacts cc on cc.id = a.campaign_contact_id
       where cc.campaign_id = p_campaign_id),
    (select count(distinct a.campaign_contact_id) from public.campaign_call_attempts a
       join public.campaign_contacts cc on cc.id = a.campaign_contact_id
       where cc.campaign_id = p_campaign_id),
    (select count(*) from public.campaign_contacts cc
       where cc.campaign_id = p_campaign_id and cc.in_call_queue = true);
$$;
