-- (א) הערה חופשית פר-שורת campaign_contacts - "צריך גם הערה, לא רק שיוך
-- [לנציג]" - נפרדת לגמרי מ-contacts.notes (הערה כללית לכרטיס, migration
-- 0003) ומ-mapping_note_owner/mapping_note_rep (שייכות לזרימת "מיפוי"
-- הנפרדת, migration 0082) - זו הערה תפעולית פר-קמפיין, בלי קשר לאף אחת
-- משתי אלה.
alter table public.campaign_contacts
  add column if not exists note text;

-- (ב) קיבוץ-זוגות בבניית-קבוצה: כשמסומן p_dedupe_couples, לכל זוג
-- בני-זוג מקושרים (contacts.related_contact_id + relation_label =
-- 'בן/בת זוג' - העמודה שמורה ייעודית לזוגות, ר' migration 0074) משאירים
-- רק את בעל התרומה הגבוהה יותר (שנת-שיא), ומחזירים על השורה ששרדה גם את
-- שם בן/בת הזוג ואת שנת-השיא שלו/שלה, כדי שהלקוח יוכל להציג ולבנות הערה
-- בלי round-trip נוסף.
--
-- שימו לב: שנת-השיא של בן/בת הזוג נשלפת מתוך ה-CTE "peak" (כל מי שיש לו
-- תרומה בכלל), לא מתוך "base" (מי שעבר את שאר הפילטרים) - כי בן/בת זוג
-- עם 0 תרומות פשוט לא יופיע ב-peak בכלל (peak_by_year נבנה מתוך
-- donation_transactions בלבד), כך ש-spouse_peak_amount יהפוך ל-NULL/0
-- ו"מי שיש לו תרומה, כן נכלל" ממשיך לעבוד נכון גם כשבן/בת הזוג לא היה/
-- הייתה מועמד/ת בכלל (לדוגמה, לא עבר/ה סינון מחלקה/שלב). לו היינו
-- משווים מול base היינו מפספסים בדיוק את המקרה הזה.
drop function if exists public.find_campaign_segment_candidates(
  text, uuid, text[], numeric, numeric, boolean, boolean, boolean, int, date, date, uuid, text, text, int, int
);

create or replace function public.find_campaign_segment_candidates(
  p_source text default null,
  p_stage_workspace_id uuid default null,
  p_stages text[] default null,
  p_min_peak_donation numeric default null,
  p_max_peak_donation numeric default null,
  p_has_active_commitment boolean default null,
  p_has_course_enrollment boolean default null,
  p_has_seminar_participation boolean default null,
  p_exclude_donated_within_days int default null,
  p_donation_date_from date default null,
  p_donation_date_to date default null,
  p_exclude_campaign_id uuid default null,
  p_sort_by text default 'name',
  p_sort_dir text default 'asc',
  p_limit int default 100,
  p_offset int default 0,
  p_dedupe_couples boolean default false
)
returns table(
  contact_id uuid, first text, last text, phone text, email text, source text, tags text[],
  peak_donation_amount numeric, peak_donation_year text, last_donation_date date,
  related_contact_id uuid, spouse_name text, spouse_peak_donation_amount numeric,
  total_row_count bigint
)
language sql stable as $$
  with peak_by_year as (
    select dt.contact_id,
      extract(year from dt.transaction_date)::text as donation_year,
      sum(dt.amount) as year_total
    from donation_transactions dt
    where dt.amount > 0 and dt.transaction_date is not null
    group by dt.contact_id, extract(year from dt.transaction_date)
  ),
  peak as (
    select distinct on (py.contact_id) py.contact_id, py.year_total as peak_amount, py.donation_year as peak_year
    from peak_by_year py
    order by py.contact_id, py.year_total desc
  ),
  last_donation as (
    select dt.contact_id, max(dt.transaction_date) as last_date
    from donation_transactions dt
    group by dt.contact_id
  ),
  base as (
    select c.id, c.first, c.last, c.phone, c.email, c.source, c.tags,
      peak.peak_amount, peak.peak_year, ld.last_date,
      -- שומר קישור בן/בת-זוג רק כשה-relation_label בפועל מסמן זוגיות -
      -- הגנה נוספת מעבר לקונבנציה, למרות ש-related_contact_id שמור
      -- לזוגות בלבד לפי החלטה מפורשת (ר' migration 0074).
      case when c.relation_label = 'בן/בת זוג' then c.related_contact_id else null end as spouse_id
    from contacts c
    left join peak on peak.contact_id = c.id
    left join last_donation ld on ld.contact_id = c.id
    where (p_source is null or c.source = p_source)
      and (p_stage_workspace_id is null or exists (
        select 1 from contact_departments cd
        where cd.contact_id = c.id and cd.workspace_id = p_stage_workspace_id
          and (p_stages is null or cd.stage = any(p_stages))
      ))
      and (p_min_peak_donation is null or coalesce(peak.peak_amount, 0) >= p_min_peak_donation)
      and (p_max_peak_donation is null or coalesce(peak.peak_amount, 0) <= p_max_peak_donation)
      and (p_has_active_commitment is null or exists (
        select 1 from commitments cm where cm.contact_id = c.id and cm.status = 'active'
      ) = p_has_active_commitment)
      and (p_has_course_enrollment is null or exists (
        select 1 from contact_course_enrollments ce where ce.contact_id = c.id
      ) = p_has_course_enrollment)
      and (p_has_seminar_participation is null or exists (
        select 1 from contact_seminar_participations sp where sp.contact_id = c.id
      ) = p_has_seminar_participation)
      and (p_exclude_donated_within_days is null or ld.last_date is null
        or ld.last_date < current_date - (p_exclude_donated_within_days || ' days')::interval)
      and ((p_donation_date_from is null and p_donation_date_to is null) or exists (
        select 1 from donation_transactions dt2
        where dt2.contact_id = c.id
          and (p_donation_date_from is null or dt2.transaction_date >= p_donation_date_from)
          and (p_donation_date_to is null or dt2.transaction_date <= p_donation_date_to)
      ))
      and (p_exclude_campaign_id is null or not exists (
        select 1 from campaign_contacts cc where cc.campaign_id = p_exclude_campaign_id and cc.contact_id = c.id
      ))
  ),
  -- מצטרף אל peak (לא base!) עבור נתוני בן/בת הזוג - ר' הסבר למעלה.
  base_with_spouse as (
    select b.*,
      spouse_peak.peak_amount as spouse_peak_amount,
      nullif(trim(concat_ws(' ', sc.first, sc.last)), '') as spouse_name
    from base b
    left join peak spouse_peak on spouse_peak.contact_id = b.spouse_id
    left join contacts sc on sc.id = b.spouse_id
  ),
  -- keep_this_one מחושב על כל הסט המסונן, לפני limit/offset - כדי שעימוד
  -- (pagination) לעולם לא יפצל זוג בין שני עמודים: אם p_dedupe_couples
  -- כבוי, או שאין קישור-זוג, משאירים תמיד; אחרת משאירים את בעל שנת-השיא
  -- הגבוהה יותר, ובמקרה תיקו (סכומים שווים, כולל 0=0) - מכריעים לפי id
  -- גדול יותר, כך שבדיוק אחד מהזוג שורד (לעולם לא אפס ולעולם לא שניים,
  -- כי בדיוק אחד מ-A.id>B.id / B.id>A.id נכון).
  filtered as (
    select *,
      (
        not p_dedupe_couples
        or spouse_id is null
        or coalesce(peak_amount, 0) > coalesce(spouse_peak_amount, 0)
        or (coalesce(peak_amount, 0) = coalesce(spouse_peak_amount, 0) and id > spouse_id)
      ) as keep_this_one
    from base_with_spouse
  ),
  counted as (
    select *, count(*) over() as total_row_count
    from filtered
    where keep_this_one
  )
  select id, first, last, phone, email, source, tags, peak_amount, peak_year, last_date,
    spouse_id as related_contact_id, spouse_name, spouse_peak_amount as spouse_peak_donation_amount,
    total_row_count
  from counted
  order by
    case when p_sort_by = 'amount' and p_sort_dir = 'desc' then peak_amount end desc nulls last,
    case when p_sort_by = 'amount' and p_sort_dir = 'asc' then peak_amount end asc nulls last,
    case when p_sort_by = 'last_donation' and p_sort_dir = 'desc' then last_date end desc nulls last,
    case when p_sort_by = 'last_donation' and p_sort_dir = 'asc' then last_date end asc nulls last,
    case when p_sort_by = 'name' then last end asc nulls last
  limit p_limit offset p_offset;
$$;
