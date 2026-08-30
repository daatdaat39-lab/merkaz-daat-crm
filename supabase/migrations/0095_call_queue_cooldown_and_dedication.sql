-- ============================================================
-- 1) יציאה אוטומטית מהתור בתוצאות סופיות + cooldown ל"לא ענה" -
-- מטרה: "למה אותו אדם חוזר מיד". שלוש תוצאות (not_interested/
-- donating_now/requested_link) הן סופיות לגמרי - מבוצע בתוך
-- log_campaign_call_attempt עצמו (לא בקוד השרת) כדי שזה יחול תמיד,
-- לא משנה איזה caller קרא ל-RPC. call_back ממשיך להסתמך על
-- callback_at עתידי (כבר קיים, ר' 0094). no_answer מקבל cooldown
-- זמני (ברירת מחדל 30 דקות) דרך פרמטר חדש ב-claim/count, לא הדרה
-- קבועה - חוזר לתור מעצמו אחרי שהחלון עבר, בלי צורך בהתערבות ידנית.
-- ============================================================
alter table public.campaign_call_attempts
  add column if not exists dedication_text text;

comment on column public.campaign_call_attempts.dedication_text is
  'טקסט הקדשה - רלוונטי רק כש-outcome=donating_now, מוצג ב-ContactSummaryPanel';

create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid,
  p_agent_id uuid,
  p_outcome text,
  p_note text default null,
  p_note_type text default 'general',
  p_callback_at timestamptz default null,
  p_dedication_text text default null
)
returns public.campaign_call_attempts
language plpgsql as $$
declare
  v_row public.campaign_call_attempts;
begin
  insert into public.campaign_call_attempts
    (campaign_contact_id, agent_id, attempt_number, outcome, note, note_type, callback_at, dedication_text)
  select
    p_campaign_contact_id, p_agent_id,
    coalesce((select count(*) from public.campaign_call_attempts where campaign_contact_id = p_campaign_contact_id), 0) + 1,
    p_outcome, p_note, p_note_type, p_callback_at,
    case when p_outcome = 'donating_now' then p_dedication_text else null end
  returning * into v_row;

  -- הדרה קבועה מהתור לתוצאות סופיות - מנהל יכול להחזיר ידנית דרך
  -- הצ'קבוקס הקיים "בתור" בטבלת הניהול (CampaignDetailClient.js).
  if p_outcome in ('not_interested', 'donating_now', 'requested_link') then
    update public.campaign_contacts set in_call_queue = false where id = p_campaign_contact_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.claim_next_campaign_contact(
  p_campaign_id uuid,
  p_caller uuid,
  p_category text default null,
  p_excluded_categories text[] default array['בן/בת זוג - לא להתקשר', 'לא רלוונטי'],
  p_stale_minutes int default 15,
  p_no_answer_cooldown_minutes int default 30
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
    and (p_category is null or cc.category = p_category)
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (v_claim_scope <> 'assigned_only' or cc.assigned_to = p_caller or cc.assigned_to is null)
    and not (latest_attempt.outcome = 'call_back' and latest_attempt.callback_at is not null and latest_attempt.callback_at > now())
    and not (latest_attempt.outcome = 'no_answer' and latest_attempt.created_at > now() - (p_no_answer_cooldown_minutes || ' minutes')::interval)
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

create or replace function public.count_callable_campaign_contacts_by_category(
  p_campaign_id uuid,
  p_caller uuid,
  p_excluded_categories text[] default array['בן/בת זוג - לא להתקשר', 'לא רלוונטי'],
  p_stale_minutes int default 15,
  p_no_answer_cooldown_minutes int default 30
)
returns table(category text, callable_count bigint)
language sql stable as $$
  select cc.category, count(*)
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
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (
      (select claim_scope from public.campaigns where id = p_campaign_id) <> 'assigned_only'
      or cc.assigned_to = p_caller or cc.assigned_to is null
    )
    and not (latest_attempt.outcome = 'call_back' and latest_attempt.callback_at is not null and latest_attempt.callback_at > now())
    and not (latest_attempt.outcome = 'no_answer' and latest_attempt.created_at > now() - (p_no_answer_cooldown_minutes || ' minutes')::interval)
  group by cc.category;
$$;
