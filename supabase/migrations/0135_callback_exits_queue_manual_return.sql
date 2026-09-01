-- לפי בקשה: "ביקש להתקשר מאוחר יותר" כבר לא חוזר אוטומטית לתור המשותף
-- של כולם ברגע callback_at - יוצא מהתור מיד (כמו "לא ענה" עכשיו), נשאר
-- ברשימת "שיחות-חזרה" (get_pending_callbacks, לא השתנתה בהתנהגותה - לא
-- תלויה ב-in_call_queue), וחוזר לתור רק ידנית ע"י מנהל. גישה אישית של
-- הנציג-שקבע (הרשימה "ביקשו ממני לחזור אליהם"/חיפוש) לא נחסמת - זה
-- עדיין עובד כרגיל, רק ה"הבא בתור" האקראי לא ידחוף את זה יותר לאף אחד.
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
    update public.campaign_contacts set no_answer_streak = 0, in_call_queue = false where id = p_campaign_contact_id;
  end if;
  return v_row;
end; $$;

-- מוסיף requested_at (מתי בפועל ביקשו את השיחה-חזרה, לא רק callback_at -
-- מתי צריך לחזור) לרשימת שיחות-החזרה, כדי שהלשונית החדשה בדף הקמפיין
-- תוכל להציג גם "מי" וגם "מתי ביקשו" וגם "מתי לחזור" יחד.
drop function if exists public.get_pending_callbacks(uuid, uuid);

create or replace function public.get_pending_callbacks(p_campaign_id uuid, p_agent_id uuid default null)
returns table(row_id uuid, contact_id uuid, first text, last text, phone text, callback_at timestamptz, scheduled_by uuid, requested_at timestamptz)
language sql stable as $$
  select cc.id, cc.contact_id, c.first, c.last, c.phone, latest.callback_at, latest.agent_id, latest.created_at
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  join lateral (
    select outcome, callback_at, agent_id, created_at from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id order by a.created_at desc limit 1
  ) latest on true
  where cc.campaign_id = p_campaign_id and latest.outcome = 'call_back' and latest.callback_at is not null
    and (p_agent_id is null or latest.agent_id = p_agent_id)
  order by latest.callback_at asc;
$$;
