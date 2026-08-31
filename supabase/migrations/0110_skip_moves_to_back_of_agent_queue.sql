-- תיקון אמיתי ל"דלג מחזיר אותי לאותו איש קשר": 0108 מנע רק את התפיסה-
-- המיידית-הבאה, אבל עם מאגר קטן של אנשי-קשר זמינים זה עדיין "מקפיץ"
-- בין אותם כמה שורות. הפתרון הנכון: "דלג" דוחף את השורה לסוף התור -
-- אבל רק עבור הנציג הזה בעצמו (לא חוסם אותה מנציגים אחרים) - נציג ש-
-- כבר דילג על מישהו יראה אותו שוב רק אחרי שכל השאר נגמר לו.
create table if not exists public.campaign_contact_skips (
  campaign_contact_id uuid not null references public.campaign_contacts(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  skipped_at timestamptz not null default now(),
  primary key (campaign_contact_id, agent_id)
);
alter table public.campaign_contact_skips enable row level security;
create policy "campaign_contact_skips_all_authenticated" on public.campaign_contact_skips for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- אותה חתימה בדיוק כמו 0108 - create or replace אמיתי (לא overload חדש).
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
  order by (my_skip.skipped_at is not null), cc.id
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
