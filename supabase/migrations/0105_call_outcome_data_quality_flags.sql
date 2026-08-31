-- 4 תוצאות-שיחה חדשות לזרימת "ענה" - לא רק תרם/לא מעוניין/חזרה, אלא
-- דיווח על בעיית-נתונים שהטלפן מזהה תוך כדי שיחה: מספר שגוי (לא האדם),
-- כפילות ברשימה, כבר יש הוראת-קבע/תרומה פעילה, או בעיה טכנית במספר
-- (מנותק/לא בשימוש). כולן "טרמינליות" - כמו not_interested, מוציאות
-- אוטומטית מהתור (אין טעם להתקשר שוב).
alter table public.campaign_call_attempts drop constraint if exists campaign_call_attempts_outcome_check;
alter table public.campaign_call_attempts add constraint campaign_call_attempts_outcome_check
  check (outcome in (
    'no_answer', 'donating_now', 'requested_link', 'not_interested', 'call_back',
    'wrong_number', 'duplicate_contact', 'active_donation', 'number_issue'
  ));

-- אותה חתימה בדיוק כמו ב-0099 - create or replace אמיתי (לא overload חדש).
create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid, p_agent_id uuid, p_outcome text,
  p_note text default null, p_note_type text default 'general', p_callback_at timestamptz default null,
  p_dedication_text text default null, p_no_answer_reason text default null,
  p_pledge_details text default null, p_donation_amount numeric default null
) returns public.campaign_call_attempts language plpgsql as $$
declare v_row public.campaign_call_attempts; v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from public.campaign_contacts where id = p_campaign_contact_id;
  insert into public.campaign_call_attempts
    (campaign_contact_id, campaign_id, agent_id, attempt_number, outcome, note, note_type, callback_at,
     dedication_text, no_answer_reason, pledge_details, donation_amount)
  select p_campaign_contact_id, v_campaign_id, p_agent_id,
    coalesce((select count(*) from public.campaign_call_attempts where campaign_contact_id = p_campaign_contact_id), 0) + 1,
    p_outcome, p_note, p_note_type, p_callback_at,
    case when p_outcome = 'donating_now' then p_dedication_text else null end,
    case when p_outcome = 'no_answer' then p_no_answer_reason else null end,
    case when p_outcome = 'requested_link' then p_pledge_details else null end,
    case when p_outcome = 'donating_now' then p_donation_amount else null end
  returning * into v_row;
  if p_outcome in ('not_interested', 'donating_now', 'requested_link', 'wrong_number', 'duplicate_contact', 'active_donation', 'number_issue') then
    update public.campaign_contacts set in_call_queue = false where id = p_campaign_contact_id;
  end if;
  return v_row;
end; $$;
