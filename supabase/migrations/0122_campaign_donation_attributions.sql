-- "מי תרם אחרי ששוחחנו איתו" - מאחד שני אותות נפרדים: (א) "תורם עכשיו"
-- שתויג ידנית תוך-כדי-שיחה (campaign_call_attempts.outcome='donating_now'),
-- ו-(ב) תרומה אמיתית שזוהתה אוטומטית ע"י סנכרון-קשר (donation_transactions)
-- על תורם שכבר חבר בקמפיין פתוח-לטלפניה - notifyOpenCampaignsOfDonation
-- (kesherSyncCore.js) לא יודעת מי ניהל את השיחה, אז מיוחסת כאן לנציג
-- שערך את ניסיון-השיחה האחרון על אותה שורה, אם קיים כזה בכלל (אחרת NULL -
-- "לא ניתן לייחס", מוצג רק למנהל דרך p_agent_id=null). שתי השורות נשארות
-- שתי רשומות נפרדות במכוון (לא deduplication) - אלה שני אירועים שונים.
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
    select agent_id from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id order by a.created_at desc limit 1
  ) latest_attempt on true
  where cc.campaign_id = p_campaign_id
    and (p_agent_id is null or latest_attempt.agent_id = p_agent_id)

  order by occurred_at desc;
$$;
