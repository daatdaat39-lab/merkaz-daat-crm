-- תיקון: הקמפיין "למען דעת - אלול תשפ"ו" (וכל קמפיין שנבנה רק דרך בניית-
-- קבוצה, בלי לעבור אף פעם דרך "⚙ ניהול שלבים") לא מקבל שום שורה ב-
-- campaign_stages בכלל - כל campaign_contacts.status שלו הוא פשוט המחרוזת
-- הקבועה 'pending', בלי שום שלב תואם. ה-inner join המקורי ל-campaign_stages
-- ב-0092 דרש שורת-שלב תואמת כדי שהשורה תיכלל בכלל - במקרה כזה זה מסנן
-- שקט את *כל* הקמפיין (אומת בפועל: תור ריק על קמפיין עם אלפי שורות
-- זמינות). הופך ל-left join + coalesce כדי ששלבים יהיו רשות: קמפיין בלי
-- שלבים בכלל פשוט לא מסנן "שלב-זכייה", בדיוק כמו שלא היה לו את המושג הזה.
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
  where cc.campaign_id = p_campaign_id
    and coalesce(c.frozen, false) = false
    and coalesce(cs.is_won_stage, false) = false
    and (p_category is null or cc.category = p_category)
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (v_claim_scope <> 'assigned_only' or cc.assigned_to = p_caller or cc.assigned_to is null)
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
  where cc.campaign_id = p_campaign_id
    and coalesce(c.frozen, false) = false
    and coalesce(cs.is_won_stage, false) = false
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (
      (select claim_scope from public.campaigns where id = p_campaign_id) <> 'assigned_only'
      or cc.assigned_to = p_caller or cc.assigned_to is null
    )
  group by cc.category;
$$;
