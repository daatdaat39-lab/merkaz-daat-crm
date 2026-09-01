-- שני תיקונים על get_campaign_donation_attributions לפי משוב חי:
-- (א) חוזרים לדרוש ניסיון-שיחה אמיתי בקמפיין הזה (join רגיל, לא left
--     join) - "רק מי שבאמת פנינו אליו דרך הדף הזה", לא כל מי שנמצא
--     במקרה ברשימת-אנשי-הקשר הענקית של הקמפיין (6,000+) ותרם מכל סיבה
--     שהיא. זה מבטל את "לא ניתן לייחס"/"לא פנינו אליהם" לגמרי - אם היה
--     ניסיון-שיחה, תמיד יש נציג לייחס אליו.
-- (ב) מונע כפילות אמיתית שנצפתה בפועל: כשטלפן/ית מתייג/ת "תורם עכשיו"
--     תוך-כדי-שיחה, וסנכרון-קשר קולט את אותה תרומה בדיוק כמה שעות
--     מאוחר יותר - זה יצר שתי רשומות לאותה תרומה. עכשיו: ענף kesher_sync
--     מדלג על תרומה אם כבר קיים תיוג-ידני "תורם עכשיו" על אותה שורה
--     בטווח של יום לפני/אחרי תאריך-התנועה.
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

  order by occurred_at desc;
$$;
