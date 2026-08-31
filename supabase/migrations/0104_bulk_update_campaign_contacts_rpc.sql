-- אומת בפועל מול הנתונים החיים: bulkUpdateCampaignContactsField (0103,
-- שאילתת update().in('id', rowIds) יחידה מ-supabase-js) עדיין נכשל
-- בקנה-מידה גדול - .in() עם רשימת UUIDs נשלח כ-query string ב-URL, ומעל
-- כ-160-1000 מזהים (~6,000-37,000 תווים) מקבל "Bad Request" ממגבלת אורך-
-- URL אצל ה-proxy/PostgREST. זו בדיוק אותה תופעה שנראתה בעבר (רק 160
-- שורות התעדכנו בפועל) - לא היה קשור לקטגוריה ספציפית, אלא למגבלת אורך.
-- הפתרון: RPC שמקבל את רשימת המזהים כמערך uuid[] בגוף הבקשה (JSON POST),
-- לא ב-URL - Postgres מטפל במערך של אלפי איברים בשאילתה אחת בלי בעיה.
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
  p_has_responsible_person boolean default false
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
    responsible_person = case when p_has_responsible_person then p_responsible_person else cc.responsible_person end
  where cc.campaign_id = p_campaign_id and cc.id = any(p_row_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
