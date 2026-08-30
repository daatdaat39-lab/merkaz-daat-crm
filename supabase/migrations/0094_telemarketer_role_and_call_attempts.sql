-- ============================================================
-- 1) תפקיד 'telemarketer' חדש - נעילה מלאה: אחרי התחברות רואה רק את
-- תור-השיחות. workspace_members.role היה מוגבל ל-owner/admin/member
-- מאז 0001_workspaces.sql - מוסיפים ערך רביעי בלי לשבור אף constraint/
-- קוד קיים (isMemberOfWorkspace לא מסנן לפי role בכלל).
-- ============================================================
alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'member', 'telemarketer'));

-- ============================================================
-- 2) הכללה/הדרה פר-איש-קשר מהתור (בנוסף לקטגוריה) - ברירת מחדל true
-- כדי שכל השורות הקיימות היום ימשיכו להיות בתור בדיוק כמו קודם.
-- ============================================================
alter table public.campaign_contacts
  add column if not exists in_call_queue boolean not null default true;

create index if not exists campaign_contacts_queue_idx
  on public.campaign_contacts(campaign_id, in_call_queue);

-- ============================================================
-- 3) יומן ניסיונות-שיחה - מקור-האמת להיסטוריה חוצת-נציגים, במקום
-- להסתמך רק על campaign_contacts.note. attempt_number מחושב כ-count
-- של ניסיונות קודמים לאותה שורה + 1, בתוך אותה הוראת insert - בטוח
-- בפועל כי רק מי שמחזיק claim על השורה יכול לקרוא ל-RPC הזה.
-- ============================================================
create table public.campaign_call_attempts (
  id uuid primary key default gen_random_uuid(),
  campaign_contact_id uuid not null references public.campaign_contacts(id) on delete cascade,
  agent_id uuid references auth.users(id) on delete set null,
  attempt_number int not null,
  outcome text not null check (outcome in ('no_answer', 'donating_now', 'requested_link', 'not_interested', 'call_back')),
  note text,
  note_type text not null default 'general' check (note_type in ('donation', 'general', 'other')),
  callback_at timestamptz,
  created_at timestamptz not null default now()
);

create index campaign_call_attempts_cc_idx on public.campaign_call_attempts(campaign_contact_id, created_at desc);
create index campaign_call_attempts_agent_idx on public.campaign_call_attempts(agent_id, created_at desc);

-- RLS פתוח - אותו דפוס פרויקט-רחב בדיוק כמו contacts/campaigns/phone_calls -
-- ההרשאה האמיתית נאכפת בקוד השרת (claimed_by === user.id בפעולות),
-- לא ב-DB, בדיוק כמו כל שאר הטבלאות במערכת הזו.
alter table public.campaign_call_attempts enable row level security;
create policy "campaign_call_attempts_all_authenticated"
  on public.campaign_call_attempts for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- RPC אטומי לרישום ניסיון + חישוב attempt_number
create or replace function public.log_campaign_call_attempt(
  p_campaign_contact_id uuid,
  p_agent_id uuid,
  p_outcome text,
  p_note text default null,
  p_note_type text default 'general',
  p_callback_at timestamptz default null
)
returns public.campaign_call_attempts
language plpgsql as $$
declare
  v_row public.campaign_call_attempts;
begin
  insert into public.campaign_call_attempts
    (campaign_contact_id, agent_id, attempt_number, outcome, note, note_type, callback_at)
  select
    p_campaign_contact_id, p_agent_id,
    coalesce((select count(*) from public.campaign_call_attempts where campaign_contact_id = p_campaign_contact_id), 0) + 1,
    p_outcome, p_note, p_note_type, p_callback_at
  returning * into v_row;
  return v_row;
end;
$$;

-- מחיקת ניסיון (לצורך "בטל") - מגבילה בקוד השרת (agent_id, ניסיון-אחרון,
-- חלון-זמן), לא כאן - הפונקציה הזו רק מבצעת את המחיקה עצמה.
create or replace function public.delete_campaign_call_attempt(p_attempt_id uuid)
returns void language sql as $$
  delete from public.campaign_call_attempts where id = p_attempt_id;
$$;

-- ============================================================
-- 4) claim_next_campaign_contact / count_callable... - שתי תוספות-WHERE:
-- (א) cc.in_call_queue = true
-- (ב) latest_attempt (lateral) - אם הניסיון האחרון על השורה הוא
-- outcome='call_back' עם callback_at עתידי, השורה לא זמינה עד שהזמן עבר.
-- שאר ה-body זהה ל-0093 (LEFT JOIN campaign_stages, coalesce is_won_stage).
-- ============================================================
create or replace function public.claim_next_campaign_contact(
  p_campaign_id uuid,
  p_caller uuid,
  p_category text default null,
  p_excluded_categories text[] default array['בן/בת זוג - לא להתקשר', 'לא רלוונטי'],
  p_stale_minutes int default 15
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
    select outcome, callback_at
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
  p_stale_minutes int default 15
)
returns table(category text, callable_count bigint)
language sql stable as $$
  select cc.category, count(*)
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  left join public.campaign_stages cs on cs.campaign_id = cc.campaign_id and cs.stage_key = cc.status
  left join lateral (
    select outcome, callback_at
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
  group by cc.category;
$$;
