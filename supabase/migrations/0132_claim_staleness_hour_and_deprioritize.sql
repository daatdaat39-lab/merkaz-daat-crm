-- שתי הגנות משלימות נגד "כרטיס נחטף מנציג אחר תוך-כדי שיחה" - הטלפנים
-- מתקשרים מהנייד האישי (tel:), שדוחף את הדפדפן לרקע כל משך השיחה;
-- דפדפנים בנייד משהים טיימרים (כולל ה-heartbeat, migration 0119) בטאבים
-- ברקע כדי לחסוך סוללה, אז אי אפשר לסמוך רק על heartbeat שיספיק "להתעורר"
-- בזמן בשיחה ארוכה. (א) מגדילים את חלון-התפוגה מ-15 דקות לשעה - שיחת
-- מכירה כמעט אף פעם לא עוברת שעה, אז זה מרווח-ביטחון גדול שלא תלוי
-- בטיימר-רקע בכלל. (ב) גם אחרי שהתפוגה חולפת, שורה שעדיין claimed_by
-- לא-null (מישהו עדיין "מחזיק" אותה, גם אם באיחור) מדורגת אחרי כל שורה
-- לא-תפוסה לגמרי - נבחרת רק כמוצא-אחרון אמיתי, לא הראשונה-שמתאימה.
create or replace function public.claim_next_campaign_contact(
  p_campaign_id uuid,
  p_caller uuid,
  p_category text default null,
  p_excluded_categories text[] default array['בן/בת זוג - לא להתקשר', 'לא רלוונטי'],
  p_stale_minutes int default 60,
  p_no_answer_cooldown_minutes int default 60,
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
  order by
    (cc.claimed_by is not null),
    (my_skip.skipped_at is not null),
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

-- אותה הגדלת-חלון גם ל-claim_specific_campaign_contact (תפיסה דרך חיפוש-
-- שם/טלפון, לא רק "הבא בתור") - כדי שלא יהיה עוקף לגמרי מגן-ה-60-דקות.
create or replace function public.claim_specific_campaign_contact(
  p_row_id uuid,
  p_caller uuid,
  p_stale_minutes int default 60
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
  v_claimed_by uuid;
  v_claimed_at timestamptz;
  v_found boolean := false;
begin
  select cc.claimed_by, cc.claimed_at, true into v_claimed_by, v_claimed_at, v_found
  from public.campaign_contacts cc
  where cc.id = p_row_id
  for update skip locked;

  if not v_found then
    return; -- לא נמצא, או ננעל כרגע ע"י תפיסה מקבילה אחרת
  end if;
  if v_claimed_by is not null and v_claimed_at >= now() - (p_stale_minutes || ' minutes')::interval then
    return; -- כבר תפוס בפועל ע"י מישהו אחר
  end if;

  update public.campaign_contacts
  set claimed_by = p_caller, claimed_at = now()
  where id = p_row_id;

  return query
  select cc.id, cc.contact_id, cc.category, cc.status, cc.note, cc.claimed_at,
    c.first, c.last, c.phone, c.phone2, c.email,
    c.related_contact_id, c.relation_label,
    spouse_cc.id, spouse_cc.status, spouse_cc.claimed_by
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  left join public.campaign_contacts spouse_cc
    on spouse_cc.campaign_id = cc.campaign_id and spouse_cc.contact_id = c.related_contact_id
  where cc.id = p_row_id;
end;
$$;
