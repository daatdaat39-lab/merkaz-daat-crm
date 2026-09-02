-- חיפוש-דמיון ("אולי התכוונת ל...") בתור-השיחות - חיפוש-שם-מלא כבר תוקן
-- (migration קודמת, commit 72ec982) לפצל-מילים, אבל זה עדיין מתאים רק
-- על תת-מחרוזת מדויקת - טעות-הקלדה (אות חסרה/מוחלפת, כמו "דוד" מול
-- "דויד") לא נתפסת ע"י ilike בכלל. pg_trgm כבר מותקן ומאונדקס
-- (GIN, migration 0066_pg_trgm_name_similarity.sql) על בדיוק הביטוי
-- lower(trim(first || ' ' || last)) - נעזרים באותו similarity() כדי
-- להציע התאמות-קרובות, בנפרד מהתוצאות-המדויקות (מוצג ב-UI כרשימה
-- שנייה, מתחת לתוצאות המדויקות).
create or replace function public.search_campaign_contacts_by_name_similarity(
  p_campaign_id uuid,
  p_query text,
  p_exclude_contact_ids uuid[] default array[]::uuid[],
  p_min_similarity float default 0.25,
  p_limit int default 6
)
returns table(
  row_id uuid, contact_id uuid, first text, last text, phone text,
  status text, category text, claimed_by uuid, sim float
)
language sql
stable
as $$
  select cc.id, c.id, c.first, c.last, c.phone, cc.status, cc.category, cc.claimed_by,
    similarity(lower(trim(coalesce(c.first, '') || ' ' || coalesce(c.last, ''))), lower(trim(p_query))) as sim
  from public.contacts c
  join public.campaign_contacts cc on cc.campaign_id = p_campaign_id and cc.contact_id = c.id
  where not (c.id = any(p_exclude_contact_ids))
    and similarity(lower(trim(coalesce(c.first, '') || ' ' || coalesce(c.last, ''))), lower(trim(p_query))) > p_min_similarity
  order by sim desc
  limit p_limit;
$$;
