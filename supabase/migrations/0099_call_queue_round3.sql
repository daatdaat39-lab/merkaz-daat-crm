-- עמודות חדשות על campaign_call_attempts
alter table public.campaign_call_attempts
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists no_answer_reason text check (no_answer_reason in ('busy','wrong_number','voicemail')),
  add column if not exists pledge_details text,
  add column if not exists donation_amount numeric;

-- מילוי-לאחור לשורות קיימות (כדי ש-campaign_id לא יישאר null בהיסטוריה)
update public.campaign_call_attempts a
  set campaign_id = cc.campaign_id
  from public.campaign_contacts cc
  where a.campaign_contact_id = cc.id and a.campaign_id is null;

create index if not exists campaign_call_attempts_campaign_idx on public.campaign_call_attempts(campaign_id, created_at desc);

-- log_campaign_call_attempt: ממלא campaign_id אוטומטית + פרמטרים חדשים
-- (סיבת-לא-ענה, פרטי-התחייבות-עצמאית, סכום-תרומה-לתיוג-בלבד).
create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid, p_agent_id uuid, p_outcome text,
  p_note text default null, p_note_type text default 'general', p_callback_at timestamptz default null,
  p_dedication_text text default null, p_no_answer_reason text default null,
  p_pledge_details text default null, p_donation_amount numeric default null
)
returns public.campaign_call_attempts
language plpgsql as $$
declare
  v_row public.campaign_call_attempts;
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from public.campaign_contacts where id = p_campaign_contact_id;

  insert into public.campaign_call_attempts
    (campaign_contact_id, campaign_id, agent_id, attempt_number, outcome, note, note_type, callback_at,
     dedication_text, no_answer_reason, pledge_details, donation_amount)
  select
    p_campaign_contact_id, v_campaign_id, p_agent_id,
    coalesce((select count(*) from public.campaign_call_attempts where campaign_contact_id = p_campaign_contact_id), 0) + 1,
    p_outcome, p_note, p_note_type, p_callback_at,
    case when p_outcome = 'donating_now' then p_dedication_text else null end,
    case when p_outcome = 'no_answer' then p_no_answer_reason else null end,
    case when p_outcome = 'requested_link' then p_pledge_details else null end,
    case when p_outcome = 'donating_now' then p_donation_amount else null end
  returning * into v_row;

  if p_outcome in ('not_interested', 'donating_now', 'requested_link') then
    update public.campaign_contacts set in_call_queue = false where id = p_campaign_contact_id;
  end if;

  return v_row;
end;
$$;

-- אירועי-משמרת לטלפן (התחלה/הפסקה/חזרה-מהפסקה/סיום) - טבלה נפרדת
-- מ-user_activity_days (heartbeat פסיבי בכל טעינת-עמוד, לא מייצג משמרת
-- מוצהרת עם הפסקות). משמש גם לדוח-שעות למנהל (calling-dashboard).
create table public.call_session_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  event_type text not null check (event_type in ('start', 'break_start', 'break_end', 'end')),
  created_at timestamptz not null default now()
);
create index call_session_events_agent_idx on public.call_session_events(agent_id, campaign_id, created_at);

alter table public.call_session_events enable row level security;
create policy "call_session_events_all_authenticated"
  on public.call_session_events for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- "שיחות חזרה ממתינות" - הניסיון-האחרון על השורה הוא call_back, בלי
-- תלות אם יש כרגע claim פעיל - כדי שמנהל יראה גם מה ממתין כשאין טלפן
-- מחובר בכלל, ומספרים לא "נעלמים".
create or replace function public.get_pending_callbacks(p_campaign_id uuid)
returns table(
  row_id uuid, contact_id uuid, first text, last text, phone text,
  callback_at timestamptz, scheduled_by uuid
)
language sql stable as $$
  select cc.id, cc.contact_id, c.first, c.last, c.phone, latest.callback_at, latest.agent_id
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  join lateral (
    select outcome, callback_at, agent_id from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id order by a.created_at desc limit 1
  ) latest on true
  where cc.campaign_id = p_campaign_id and latest.outcome = 'call_back' and latest.callback_at is not null
  order by latest.callback_at asc;
$$;
