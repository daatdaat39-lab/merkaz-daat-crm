-- תיקון ל-0122: התרומה-דרך-קשר לא הייתה קשורה בזמן לקמפיין הספציפי בכלל -
-- כל תרומה היסטורית-אי-פעם של תורם שנמצא בקמפיין הזה הייתה מוצגת כאילו
-- "תרם בעקבות השיחות", גם אם התרומה הייתה שנים לפני שהקמפיין הזה בכלל
-- נפתח (התנאי היחיד היה חברות בקמפיין + open_for_telemarketing, בלי שום
-- הגבלת-תאריך). עכשיו: אם יש ניסיון-שיחה על השורה - התרומה חייבת להיות
-- מתאריך הניסיון-האחרון ואילך; אם אין שום ניסיון - מתאריך ההצטרפות
-- לקמפיין הזה ואילך (cc.created_at) - כדי שרק תרומות שבאמת יכולות
-- להיות תוצאה של הקמפיין הזה יוצגו.
create or replace function public.get_campaign_donation_attributions(p_campaign_id uuid, p_agent_id uuid default null)
returns table(
  source text, campaign_contact_id uuid, contact_id uuid,
  first text, last text, phone text,
  amount numeric, occurred_at timestamptz, attributed_agent_id uuid
)
language sql stable as $$
  select 'call_attempt'::text as source, cc.id as campaign_contact_id, cc.contact_id, c.first, c.last, c.phone,
    a.donation_amount as amount, a.created_at as occurred_at, a.agent_id as attributed_agent_id
  from public.campaign_call_attempts a
  join public.campaign_contacts cc on cc.id = a.campaign_contact_id
  join public.contacts c on c.id = cc.contact_id
  where cc.campaign_id = p_campaign_id and a.outcome = 'donating_now'
    and (p_agent_id is null or a.agent_id = p_agent_id)

  union all

  select 'kesher_sync'::text as source, cc.id as campaign_contact_id, cc.contact_id, c.first, c.last, c.phone,
    dt.amount, dt.transaction_date::timestamptz as occurred_at, latest_attempt.agent_id as attributed_agent_id
  from public.donation_transactions dt
  join public.campaign_contacts cc on cc.contact_id = dt.contact_id
  join public.campaigns camp on camp.id = cc.campaign_id and camp.open_for_telemarketing = true
  join public.contacts c on c.id = cc.contact_id
  left join lateral (
    select agent_id, created_at from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id order by a.created_at desc limit 1
  ) latest_attempt on true
  where cc.campaign_id = p_campaign_id
    and (p_agent_id is null or latest_attempt.agent_id = p_agent_id)
    and dt.transaction_date >= coalesce(latest_attempt.created_at::date, cc.created_at::date)

  order by occurred_at desc;
$$;
