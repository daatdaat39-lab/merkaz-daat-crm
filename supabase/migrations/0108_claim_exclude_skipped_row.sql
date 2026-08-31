-- באג אמיתי מדווח בשטח: "הדלג לא עובד" - נראה כאילו כלום לא קורה.
-- אומת ישירות מול הנתונים החיים: RPC השחרור עצמו עובד מצוין (בדיקה
-- ידנית שחררה claim בהצלחה) - הבעיה היא ש-claim_next_campaign_contact
-- ממיין "order by cc.id" (דטרמיניסטי לגמרי), אז ברגע שמשחררים שורה
-- ומיד תופסים "את הבא בתור" - אם השורה ששוחררה עדיין הכי-נמוכה לפי id
-- מבין השורות הזמינות, היא נתפסת מיד שוב על ידי אותו נציג. נראה בדיוק
-- כמו "דלג לא עשה כלום" כי אותו איש-קשר פשוט חוזר. גם משפיע על "X"
-- (סגירה בלי התקדמות, ר' CallQueueClient.js) שצריך לשחרר בלי לתפוס-
-- מחדש בכלל.
drop function if exists public.claim_next_campaign_contact(uuid, uuid, text, text[], int, int);

create or replace function public.claim_next_campaign_contact(
  p_campaign_id uuid,
  p_caller uuid,
  p_category text default null,
  p_excluded_categories text[] default array['בן/בת זוג - לא להתקשר', 'לא רלוונטי'],
  p_stale_minutes int default 15,
  p_no_answer_cooldown_minutes int default 30,
  p_exclude_row_id uuid default null
)
returns table(
  row_id uuid, contact_id uuid, category text, status text, note text,
  claimed_at timestamptz,
  first text, last text, phone text, phone2 text, email text,
  related_contact_id uuid, relation_label text,
  spouse_row_id uuid, spouse_status text, spouse_claimed_by uuid
)
language plpgsql as $$
declare
  v_row_id uuid;
  v_claim_scope text;
begin
  select claim_scope into v_claim_scope from public.campaigns where id = p_campaign_id;

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
  where cc.campaign_id = p_campaign_id
    and cc.in_call_queue = true
    and coalesce(c.frozen, false) = false
    and coalesce(cs.is_won_stage, false) = false
    and coalesce(cc.mapping_decision, '') <> 'לא רלוונטי'
    and (p_category is null or cc.category = p_category)
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (v_claim_scope <> 'assigned_only' or cc.assigned_to = p_caller or cc.assigned_to is null)
    and (latest_attempt.outcome is distinct from 'call_back' or latest_attempt.callback_at is null or latest_attempt.callback_at <= now())
    and (latest_attempt.outcome is distinct from 'no_answer' or latest_attempt.created_at <= now() - (p_no_answer_cooldown_minutes || ' minutes')::interval)
    and (p_exclude_row_id is null or cc.id <> p_exclude_row_id)
  order by cc.id
  for update of cc skip locked
  limit 1;

  if v_row_id is null then
    return;
  end if;

  update public.campaign_contacts
  set claimed_by = p_caller, claimed_at = now()
  where id = v_row_id;

  return query
  select cc.id, cc.contact_id, cc.category, cc.status, cc.note, cc.claimed_at,
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
