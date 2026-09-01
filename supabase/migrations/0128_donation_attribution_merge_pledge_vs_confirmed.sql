-- 0127 מנעה כפילות ע"י דילוג-מוחלט על תרומת-קשר שכבר תואמת תיוג-ידני
-- קרוב - איבד מידע: אי אפשר היה לראות אם הסכום שהתחייבו בטלפון שונה
-- מהסכום שבאמת נקלט. עכשיו במקום לדלג, מאחדים לשורה אחת עם שני סכומים:
-- amount (מה שבאמת נכנס, מקשר) ו-pledged_amount (מה שהובטח בטלפון) -
-- כדי לראות פערים. שלושה ענפים: (1) merged - יש גם תיוג וגם אישור-קשר
-- קרובים בזמן, (2) kesher_sync בלבד - נכנס בפועל בלי תיוג-טלפוני תואם,
-- (3) call_attempt בלבד - הובטח בטלפון אבל עדיין לא נמצא אישור-קשר
-- תואם (יכול להיות שעדיין בדרך, או שלא התקבל בפועל).
drop function if exists public.get_campaign_donation_attributions(uuid, uuid);

create or replace function public.get_campaign_donation_attributions(p_campaign_id uuid, p_agent_id uuid default null)
returns table(
  source text, campaign_contact_id uuid, contact_id uuid,
  first text, last text, phone text,
  amount numeric, pledged_amount numeric, occurred_at timestamptz, attributed_agent_id uuid
)
language sql stable as $$
  -- (1) תרומה שאושרה בקשר ותואמת תיוג-ידני קרוב בזמן - שורה אחת עם שני
  -- הסכומים, כדי שאפשר יהיה לראות פערים בין הובטח לבין מה שבאמת נכנס.
  select 'merged'::text as source, cc.id as campaign_contact_id, cc.contact_id, c.first, c.last, c.phone,
    dt.amount, matched_pledge.donation_amount as pledged_amount,
    dt.transaction_date::timestamptz as occurred_at, matched_pledge.agent_id as attributed_agent_id
  from public.donation_transactions dt
  join public.campaign_contacts cc on cc.contact_id = dt.contact_id
  join public.campaigns camp on camp.id = cc.campaign_id and camp.open_for_telemarketing = true
  join public.contacts c on c.id = cc.contact_id
  join lateral (
    select agent_id, created_at from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id order by a.created_at desc limit 1
  ) latest_attempt on true
  join lateral (
    select agent_id, donation_amount from public.campaign_call_attempts ca2
    where ca2.campaign_contact_id = cc.id and ca2.outcome = 'donating_now'
      and ca2.created_at::date between dt.transaction_date - 1 and dt.transaction_date + 1
    order by ca2.created_at desc limit 1
  ) matched_pledge on true
  where cc.campaign_id = p_campaign_id
    and (p_agent_id is null or matched_pledge.agent_id = p_agent_id)
    and dt.transaction_date >= latest_attempt.created_at::date

  union all

  -- (2) נכנס בפועל דרך קשר, בלי תיוג-ידני תואם - עדיין דורש שיהיה
  -- ניסיון-שיחה כלשהו בקמפיין הזה (ר' 0127 - "רק דרך הדף הזה").
  select 'kesher_sync'::text as source, cc.id as campaign_contact_id, cc.contact_id, c.first, c.last, c.phone,
    dt.amount, null::numeric as pledged_amount, dt.transaction_date::timestamptz as occurred_at, latest_attempt.agent_id as attributed_agent_id
  from public.donation_transactions dt
  join public.campaign_contacts cc on cc.contact_id = dt.contact_id
  join public.campaigns camp on camp.id = cc.campaign_id and camp.open_for_telemarketing = true
  join public.contacts c on c.id = cc.contact_id
  join lateral (
    select agent_id, created_at from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id order by a.created_at desc limit 1
  ) latest_attempt on true
  where cc.campaign_id = p_campaign_id
    and (p_agent_id is null or latest_attempt.agent_id = p_agent_id)
    and dt.transaction_date >= latest_attempt.created_at::date
    and not exists (
      select 1 from public.campaign_call_attempts ca2
      where ca2.campaign_contact_id = cc.id and ca2.outcome = 'donating_now'
        and ca2.created_at::date between dt.transaction_date - 1 and dt.transaction_date + 1
    )

  union all

  -- (3) הובטח בטלפון, עדיין בלי אישור-קשר תואם (טרם נקלט/לא נכנס בפועל).
  select 'call_attempt'::text as source, cc.id as campaign_contact_id, cc.contact_id, c.first, c.last, c.phone,
    null::numeric as amount, a.donation_amount as pledged_amount, a.created_at as occurred_at, a.agent_id as attributed_agent_id
  from public.campaign_call_attempts a
  join public.campaign_contacts cc on cc.id = a.campaign_contact_id
  join public.contacts c on c.id = cc.contact_id
  where cc.campaign_id = p_campaign_id and a.outcome = 'donating_now'
    and (p_agent_id is null or a.agent_id = p_agent_id)
    and not exists (
      select 1 from public.donation_transactions dt2
      where dt2.contact_id = cc.contact_id
        and dt2.transaction_date between a.created_at::date - 1 and a.created_at::date + 1
    )

  order by occurred_at desc;
$$;
