-- מוסיף בקצה-קטן עמודה בוליאנית ל"יצא/ה מהתור כי בן/בת-הזוג נענה/תה" -
-- קבוצה נפרדת ב-CampaignDetailClient.js, אותו דפוס בדיוק כמו no_answer
-- (0121)/callback (0135). אין עמודת timestamp/reason - ה-UI מציג את שם
-- בן/בת-הזוג הקיים כבר דרך contacts.related_contact_id (page.js).
alter table public.campaign_contacts
  add column if not exists spouse_reached_exit boolean not null default false;

-- log_campaign_call_attempt: כשתוצאה מסמנת "דיברנו בפועל עם המשפחה"
-- (סיווג סופי, אושר עם המשתמש דרך כמה תרחישים קונקרטיים - לא מעוניין/
-- תורם עכשיו/ביקש לינק/ביקש לחזור/הוראת-קבע פעילה/כפילות - "מספר שגוי"/
-- "בעיית מספר" לא נספרים כאן, גם אם מישהו כן ענה בפועל: זו לא המשפחה
-- הנכונה, אין מה להוציא את בן/בת-הזוג בגלל זה), ולאיש-הקשר יש
-- contacts.related_contact_id (0023, אותו מנגנון שכבר מקושר ל-97
-- זוגות-ההורים ב-0141), ולבן/בת-הזוג יש שורת campaign_contacts באותו
-- קמפיין שעדיין in_call_queue=true - מוציאים אותה/אותו אוטומטית מהתור.
-- spouse_reached_exit מתאפס בכל ניסיון-חיוג חדש על השורה עצמה (משנה 3
-- הענפים למטה) - תוצאה טרייה תמיד גוברת על יציאה שנגרמה ע"י בן/בת-הזוג.
-- אין שינוי בחתימת הפונקציה - create or replace בלבד, בלי drop.
create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid, p_agent_id uuid, p_outcome text,
  p_note text default null, p_note_type text default 'general', p_callback_at timestamptz default null,
  p_dedication_text text default null, p_no_answer_reason text default null,
  p_pledge_details text default null, p_donation_amount numeric default null,
  p_no_answer_streak_threshold int default 1
) returns public.campaign_call_attempts language plpgsql as $$
declare
  v_row public.campaign_call_attempts;
  v_campaign_id uuid;
  v_contact_id uuid;
  v_related_contact_id uuid;
begin
  select campaign_id, contact_id into v_campaign_id, v_contact_id
  from public.campaign_contacts where id = p_campaign_contact_id;

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
    update public.campaign_contacts set in_call_queue = false, no_answer_streak = 0, spouse_reached_exit = false where id = p_campaign_contact_id;
  elsif p_outcome = 'no_answer' then
    update public.campaign_contacts
    set no_answer_streak = no_answer_streak + 1,
        in_call_queue = case when no_answer_streak + 1 >= p_no_answer_streak_threshold then false else in_call_queue end,
        spouse_reached_exit = false
    where id = p_campaign_contact_id;
  else -- call_back
    update public.campaign_contacts set no_answer_streak = 0, in_call_queue = false, spouse_reached_exit = false where id = p_campaign_contact_id;
  end if;

  if p_outcome in ('not_interested', 'donating_now', 'requested_link', 'call_back', 'active_donation', 'duplicate_contact') then
    select related_contact_id into v_related_contact_id from public.contacts where id = v_contact_id;
    if v_related_contact_id is not null then
      update public.campaign_contacts
      set in_call_queue = false, spouse_reached_exit = true
      where campaign_id = v_campaign_id
        and contact_id = v_related_contact_id
        and contact_id <> v_contact_id
        and in_call_queue = true;
    end if;
  end if;

  return v_row;
end; $$;
