-- תיקון ל-0138: similarity() רגיל משווה את כל המחרוזת "שם-פרטי שם-משפחה"
-- מול השאילתה כמקשה-אחת - אם המשתמש הקליד רק שם-פרטי-עם-טעות (המקרה
-- הנפוץ ביותר בפועל), אורך-השם-המלא-כולל-משפחה "מדלל" את הציון והתאמה
-- אמיתית לא עוברת את הסף (אומת ישירות מול נתונים חיים: "שירה" עם טעות
-- לא נמצא בכלל מול "שירה שלום"). word_similarity(word, doc) של pg_trgm
-- בודק את הקטע הכי-דומה בתוך doc, בלי להיפגע מאורך שאר-המחרוזת - נלקח
-- greatest() משני החישובים כדי לתמוך גם בשאילתת-שם-מלא (שני המילים) וגם
-- בשאילתת-מילה-בודדת.
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
  select cc.id, c.id, c.first, c.last, c.phone, cc.status, cc.category, cc.claimed_by, s.sim
  from public.contacts c
  join public.campaign_contacts cc on cc.campaign_id = p_campaign_id and cc.contact_id = c.id
  cross join lateral (
    select greatest(
      similarity(lower(trim(coalesce(c.first, '') || ' ' || coalesce(c.last, ''))), lower(trim(p_query))),
      word_similarity(lower(trim(p_query)), lower(trim(coalesce(c.first, '') || ' ' || coalesce(c.last, ''))))
    ) as sim
  ) s
  where not (c.id = any(p_exclude_contact_ids))
    and s.sim > p_min_similarity
  order by s.sim desc
  limit p_limit;
$$;
