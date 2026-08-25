-- מוסיף קריטריון-החרגה שני, נפרד מ"הוראת קבע פעילה": "תרם ב-X הימים
-- האחרונים" (לפי last_donation_date שכבר מחושב ב-RPC) - כדי לתפוס גם
-- תורמים חד-פעמיים/בתשלומים בלי הוראת-קבע רשומה, שעדיין "פעילים" בפועל
-- ולא כדאי לפנות אליהם. שני הקריטריונים משולבים אוטומטית ב-AND (כמו כל
-- שאר הפילטרים ב-WHERE) - כלומר "לא הוראת קבע פעילה" וגם "לא תרם לאחרונה"
-- יחד = בדיוק "תורם לא-פעיל" לפי שתי ההגדרות גם יחד.
drop function if exists public.find_campaign_segment_candidates(
  text, uuid, text[], numeric, numeric, boolean, boolean, boolean, uuid, text, text, int, int
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
  p_exclude_campaign_id uuid default null,
  p_sort_by text default 'name',
  p_sort_dir text default 'asc',
  p_limit int default 100,
  p_offset int default 0
)
returns table(
  contact_id uuid, first text, last text, phone text, email text, source text, tags text[],
  peak_donation_amount numeric, peak_donation_year text, last_donation_date date,
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
      peak.peak_amount, peak.peak_year, ld.last_date
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
      and (p_exclude_campaign_id is null or not exists (
        select 1 from campaign_contacts cc where cc.campaign_id = p_exclude_campaign_id and cc.contact_id = c.id
      ))
  ),
  counted as (
    select *, count(*) over() as total_row_count from base
  )
  select id, first, last, phone, email, source, tags, peak_amount, peak_year, last_date, total_row_count
  from counted
  order by
    case when p_sort_by = 'amount' and p_sort_dir = 'desc' then peak_amount end desc nulls last,
    case when p_sort_by = 'amount' and p_sort_dir = 'asc' then peak_amount end asc nulls last,
    case when p_sort_by = 'last_donation' and p_sort_dir = 'desc' then last_date end desc nulls last,
    case when p_sort_by = 'last_donation' and p_sort_dir = 'asc' then last_date end asc nulls last,
    case when p_sort_by = 'name' then last end asc nulls last
  limit p_limit offset p_offset;
$$;
