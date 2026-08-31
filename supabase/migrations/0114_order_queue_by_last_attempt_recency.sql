-- באג אמיתי: הסדר בתור היה "order by cc.id" - קבוע לפי UUID, בלי שום
-- קשר למתי בפעם האחרונה התקשרו לאיש-הקשר. אחרי שחלף cooldown ה"לא ענה"
-- (30 דקות), אם ל-UUID שלו יש ערך נמוך יחסית, הוא חוזר להיות "הראשון
-- בתור" מיד - נראה כאילו "קופץ שוב" לא רק אצל אותו נציג אלא אצל כולם
-- (כי ה-cooldown תלוי-זמן בלבד, לא בסדר). התיקון: מיון גלובלי לפי
-- latest_attempt.created_at (מי שמעולם לא נוסה קודם, ואחריו מי שהניסיון
-- האחרון עליו הכי ישן) - זה חל על כל הנציגים יחד, לא רק על מי שדילג
-- באופן אישי (ר' my_skip, שנשאר בעדיפות ראשונה מעליו).
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
    and (v_claim_scope <> 'assigned_only' or cc.assigned_to = p_caller or cc.assigned_to is null)
    and (latest_attempt.outcome is distinct from 'call_back' or latest_attempt.callback_at is null or latest_attempt.callback_at <= now())
    and (latest_attempt.outcome is distinct from 'no_answer' or latest_attempt.created_at <= now() - (p_no_answer_cooldown_minutes || ' minutes')::interval)
    and (p_exclude_row_id is null or cc.id <> p_exclude_row_id)
    and (
      cc.allow_recent_donor_call
      or not exists (select 1 from public.commitments cm where cm.contact_id = cc.contact_id and cm.status = 'active')
      or not exists (select 1 from public.donation_transactions dt where dt.contact_id = cc.contact_id and dt.transaction_date >= (current_date - interval '40 days'))
    )
  order by (my_skip.skipped_at is not null), latest_attempt.created_at nulls first, cc.id
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
