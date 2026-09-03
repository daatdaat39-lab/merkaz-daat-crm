-- מפעיל את קטגוריית "בן/בת זוג - לא להתקשר" (127 אנשי-קשר, כבר מקושרים
-- נכון ל-related_contact_id) - עד עכשיו חסומה גורפת (ברירת-מחדל ב-
-- claim_next_campaign_contact), עכשיו שהמנגנון האוטומטי (0143) קיים
-- אפשר לבטל את החסימה ולתת להם להיכנס לתור בבטחה.
-- מסירים את הקטגוריה מרשימת-החסימה-הגורפת (נשאר רק "לא רלוונטי").
create or replace function public.claim_next_campaign_contact(
  p_campaign_id uuid,
  p_caller uuid,
  p_category text default null,
  p_excluded_categories text[] default array['לא רלוונטי'],
  p_stale_minutes int default 60,
  p_no_answer_cooldown_minutes int default 60,
  p_exclude_row_id uuid default null
)
returns table(
  row_id uuid, contact_id uuid, category text, status text, note text,
  claimed_at timestamptz, assigned_to uuid,
  first text, last text, phone text, phone2 text, email text,
  related_contact_id uuid, relation_label text,
  spouse_row_id uuid, spouse_status text, spouse_claimed_by uuid
)
language plpgsql as $$
declare
  v_row_id uuid;
begin
  select cc.id into v_row_id
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  left join public.campaign_stages cs on cs.campaign_id = cc.campaign_id and cs.stage_key = cc.status
  left join lateral (
    select outcome, callback_at, created_at
    from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id
    order by a.created_at desc
    limit 1
  ) latest_attempt on true
  left join public.campaign_contact_skips my_skip
    on my_skip.campaign_contact_id = cc.id and my_skip.agent_id = p_caller
  where cc.campaign_id = p_campaign_id
    and cc.in_call_queue = true
    and coalesce(c.frozen, false) = false
    and coalesce(cs.is_won_stage, false) = false
    and coalesce(cc.mapping_decision, '') <> 'לא רלוונטי'
    and (p_category is null or cc.category = p_category)
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (cc.assigned_to is null or cc.assigned_to = p_caller)
    and (latest_attempt.outcome is distinct from 'call_back' or latest_attempt.callback_at is null or latest_attempt.callback_at <= now())
    and (latest_attempt.outcome is distinct from 'no_answer' or latest_attempt.created_at <= now() - (p_no_answer_cooldown_minutes || ' minutes')::interval)
    and (p_exclude_row_id is null or cc.id <> p_exclude_row_id)
    and (
      cc.allow_recent_donor_call
      or not exists (select 1 from public.commitments cm where cm.contact_id = cc.contact_id and cm.status = 'active')
      or not exists (select 1 from public.donation_transactions dt where dt.contact_id = cc.contact_id and dt.transaction_date >= (current_date - interval '40 days'))
    )
  order by
    (cc.claimed_by is not null),
    (my_skip.skipped_at is not null),
    (cc.assigned_to is distinct from p_caller),
    (latest_attempt.outcome is distinct from 'call_back'),
    latest_attempt.callback_at nulls last,
    latest_attempt.created_at nulls first,
    cc.id
  for update of cc skip locked
  limit 1;

  if v_row_id is null then
    return;
  end if;

  update public.campaign_contacts
  set claimed_by = p_caller, claimed_at = now()
  where id = v_row_id;

  return query
  select cc.id, cc.contact_id, cc.category, cc.status, cc.note, cc.claimed_at, cc.assigned_to,
    c.first, c.last, c.phone, c.phone2, c.email,
    c.related_contact_id, c.relation_label,
    spouse_cc.id, spouse_cc.status, spouse_cc.claimed_by
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  left join public.campaign_contacts spouse_cc
    on spouse_cc.campaign_id = cc.campaign_id and spouse_cc.contact_id = c.related_contact_id
  where cc.id = v_row_id;
end;
$$;

-- Backfill חד-פעמי: קורא את העבר לפני שמפעילים את ה-127. עבור מי שבן/בת-
-- הזוג שלו/ה כבר ענה/תה בפועל אי-פעם (תוצאה מתוך TALKED, אותו סיווג
-- בדיוק כמו log_campaign_call_attempt migration 0143) - לא נכנס/ת לתור,
-- מסומן/ת ישירות spouse_reached_exit=true (יופיע/תופיע בלשונית "בן/בת
-- הזוג נענה/תה" לבדיקת-מנהל). כל השאר נכנסים לתור כרגיל.
with helped_rows as (
  select cc.id as row_id, c.related_contact_id
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
    and cc.category = 'בן/בת זוג - לא להתקשר'
),
spouse_already_talked as (
  select hr.row_id
  from helped_rows hr
  join public.campaign_contacts spouse_cc
    on spouse_cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
    and spouse_cc.contact_id = hr.related_contact_id
  join public.campaign_call_attempts a on a.campaign_contact_id = spouse_cc.id
  where a.outcome in ('not_interested', 'donating_now', 'requested_link', 'call_back', 'active_donation', 'duplicate_contact')
)
update public.campaign_contacts
set spouse_reached_exit = true
where id in (select row_id from spouse_already_talked);

with helped_rows as (
  select cc.id as row_id
  from public.campaign_contacts cc
  where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
    and cc.category = 'בן/בת זוג - לא להתקשר'
)
update public.campaign_contacts
set in_call_queue = true
where id in (select row_id from helped_rows)
  and spouse_reached_exit = false;
