-- "לא ענה" רצוף מספר-פעמים מוציא שורה מהתור האוטומטי (כמו תוצאות-
-- טרמינליות אחרות) ומעביר אותה לקבוצה נפרדת שרק מנהל רואה/מסנן/מחזיר
-- ידנית לתור - ר' CampaignDetailClient.js. no_answer_streak מתאפס בכל
-- תוצאה שאינה "לא ענה" (כולל call_back), ובאיפוס-ידני של מנהל.
alter table public.campaign_contacts
  add column if not exists no_answer_streak int not null default 0;

-- drop קודם - הוספת פרמטר לפונקציה קיימת יוצרת עומס-פונקציה (overload)
-- חדש ב-Postgres במקום להחליף. חתימה מדויקת כפי שהוגדרה לאחרונה ב-0099.
drop function if exists public.log_campaign_call_attempt(
  uuid, uuid, text, text, text, timestamptz, text, text, text, numeric
);

create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid, p_agent_id uuid, p_outcome text,
  p_note text default null, p_note_type text default 'general', p_callback_at timestamptz default null,
  p_dedication_text text default null, p_no_answer_reason text default null,
  p_pledge_details text default null, p_donation_amount numeric default null,
  p_no_answer_streak_threshold int default 3
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

-- אותו טעם - drop עם החתימה המדויקת מ-0104 לפני הוספת פרמטר.
drop function if exists public.bulk_update_campaign_contacts(
  uuid, uuid[], text, boolean, uuid, boolean, boolean, boolean, text, boolean
);

create or replace function public.bulk_update_campaign_contacts(
  p_campaign_id uuid,
  p_row_ids uuid[],
  p_category text default null,
  p_has_category boolean default false,
  p_assigned_to uuid default null,
  p_has_assigned_to boolean default false,
  p_in_call_queue boolean default null,
  p_has_in_call_queue boolean default false,
  p_responsible_person text default null,
  p_has_responsible_person boolean default false,
  p_reset_no_answer_streak boolean default false
)
returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  update public.campaign_contacts cc
  set
    category = case when p_has_category then p_category else cc.category end,
    assigned_to = case when p_has_assigned_to then p_assigned_to else cc.assigned_to end,
    in_call_queue = case when p_has_in_call_queue then p_in_call_queue else cc.in_call_queue end,
    responsible_person = case when p_has_responsible_person then p_responsible_person else cc.responsible_person end,
    no_answer_streak = case when p_reset_no_answer_streak then 0 else cc.no_answer_streak end
  where cc.campaign_id = p_campaign_id and cc.id = any(p_row_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
