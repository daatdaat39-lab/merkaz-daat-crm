-- לפי בקשה: "לא ענה" יוציא מהתור מיד בפעם הראשונה (לא אחרי 3 רצופים),
-- והחזרה לתור תהיה רק ידנית ע"י מנהל - לא אוטומטית אחרי שעה. משתמש
-- באותה תשתית בדיוק שכבר קיימת (no_answer_streak, in_call_queue, קבוצת
-- "לא ענו X+ פעמים" + "החזר לתור" בדף הקמפיין, שכבר מנהל-בלבד) - רק
-- הסף (p_no_answer_streak_threshold) יורד מ-3 ל-1. אין צורך לגעת ב-
-- claim_next_campaign_contact - חלון-הצינון של שעה (0132) הופך לבלתי-
-- ניתן-להגעה עבור "לא ענה" (in_call_queue=false כבר מוציא את השורה
-- לפני שהתנאי הזה נבדק בכלל), לא מזיק שנשאר שם.
drop function if exists public.log_campaign_call_attempt(
  uuid, uuid, text, text, text, timestamptz, text, text, text, numeric, int
);

create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid, p_agent_id uuid, p_outcome text,
  p_note text default null, p_note_type text default 'general', p_callback_at timestamptz default null,
  p_dedication_text text default null, p_no_answer_reason text default null,
  p_pledge_details text default null, p_donation_amount numeric default null,
  p_no_answer_streak_threshold int default 1
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
    update public.campaign_contacts set in_call_queue = false, no_answer_streak = 0 where id = p_campaign_contact_id;
  elsif p_outcome = 'no_answer' then
    update public.campaign_contacts
    set no_answer_streak = no_answer_streak + 1,
        in_call_queue = case when no_answer_streak + 1 >= p_no_answer_streak_threshold then false else in_call_queue end
    where id = p_campaign_contact_id;
  else -- call_back
    update public.campaign_contacts set no_answer_streak = 0 where id = p_campaign_contact_id;
  end if;
  return v_row;
end; $$;
