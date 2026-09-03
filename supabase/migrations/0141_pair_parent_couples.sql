-- מזווג 97 (מתוך 98) זוגות-הורים שכבר מקושרים כאב+אם של אותו בוגר דרך
-- contact_relations (0074), לתוך contacts.related_contact_id/relation_label
-- הקיים (0023) - אותו שדה שכבר משמש splitCoupleContact/linkContactsAsCouple,
-- ושעליו מצטרפות claim_next_campaign_contact/claim_specific_campaign_contact
-- (0140) כדי למצוא spouse_row_id של בן/בת-הזוג באותו קמפיין.
-- קשר דו-כיווני, relation_label='בן/בת זוג' (זהה למנגנון הקיים - נבדק
-- בקוד, אף פעם לא נבדק כ-filter-key, רק מוצג ל-UI).
-- מוגן: לא נוגע בשום contact שכבר יש לו related_contact_id (רק 1 מתוך 286
-- ההורים - זיו ולינסקי - כבר מקושר/ת אמיתית ולא-קשורה; בן/בת הזוג הנגזר/ת
-- שלו/ה (זבולון קצבי) יישאר/תישאר בלי קישור בכוונה, בדיוק כמו 58 ההורים
-- עם הורה יחיד מקושר).
with parent_contacts as (
  select cc.contact_id
  from public.campaign_contacts cc
  where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
    and cc.category = 'הורי התלמידים'
),
parent_links as (
  select cr.contact_id as alumnus_id, cr.related_contact_id as parent_id
  from public.contact_relations cr
  join parent_contacts pc on pc.contact_id = cr.related_contact_id
),
both_parents as (
  select alumnus_id, min(parent_id::text)::uuid as parent_a, max(parent_id::text)::uuid as parent_b
  from parent_links
  group by alumnus_id
  having count(*) = 2 and count(distinct parent_id) = 2
),
distinct_couples as (
  select distinct parent_a, parent_b from both_parents where parent_a <> parent_b
),
safe_couples as (
  select dc.parent_a, dc.parent_b
  from distinct_couples dc
  join public.contacts ca on ca.id = dc.parent_a
  join public.contacts cb on cb.id = dc.parent_b
  where ca.related_contact_id is null and cb.related_contact_id is null
)
update public.contacts c set related_contact_id = sc.parent_b, relation_label = 'בן/בת זוג'
from safe_couples sc where c.id = sc.parent_a and c.related_contact_id is null;

with parent_contacts as (
  select cc.contact_id
  from public.campaign_contacts cc
  where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
    and cc.category = 'הורי התלמידים'
),
parent_links as (
  select cr.contact_id as alumnus_id, cr.related_contact_id as parent_id
  from public.contact_relations cr
  join parent_contacts pc on pc.contact_id = cr.related_contact_id
),
both_parents as (
  select alumnus_id, min(parent_id::text)::uuid as parent_a, max(parent_id::text)::uuid as parent_b
  from parent_links
  group by alumnus_id
  having count(*) = 2 and count(distinct parent_id) = 2
),
distinct_couples as (
  select distinct parent_a, parent_b from both_parents where parent_a <> parent_b
),
safe_couples as (
  select dc.parent_a, dc.parent_b
  from distinct_couples dc
  join public.contacts ca on ca.id = dc.parent_a
  join public.contacts cb on cb.id = dc.parent_b
  where ca.related_contact_id is null and cb.related_contact_id is null
)
update public.contacts c set related_contact_id = sc.parent_a, relation_label = 'בן/בת זוג'
from safe_couples sc where c.id = sc.parent_b and c.related_contact_id is null;
