-- תור-חיוג לטלמרקטינג: נעילת-תור בטוחה-לבו-זמניות (concurrency-safe) על
-- שורות campaign_contacts, נפרדת במכוון מ-assigned_to (שיוך ניהולי
-- ארוך-טווח) - claimed_by/claimed_at הם "מי מחזיק את איש הקשר הזה נעול
-- לשיחה פעילה עכשיו", משתחררים תוך דקות, לא ימים. claim_scope הוא
-- מתג-קמפיין: 'anyone' (בררת מחדל - כל חבר-מחלקה יכול לתפוס כל שורה
-- לא-נעולה) או 'assigned_only' (רק מי ש-assigned_to מצביע עליו יכול
-- לתפוס - למקרה שהמנהל כן רוצה לשריין שיחות לנציג ספציפי).
alter table public.campaign_contacts
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists campaign_contacts_claim_idx
  on public.campaign_contacts(campaign_id, claimed_by, claimed_at);

alter table public.campaigns
  add column if not exists claim_scope text not null default 'anyone';

comment on column public.campaigns.claim_scope is
  'anyone | assigned_only - מי רשאי לתפוס שורה לא-נעולה מהתור';

-- RPC אטומי: תופס בדיוק שורה אחת זמינה, עם FOR UPDATE SKIP LOCKED כדי
-- שתי תפיסות בו-זמנית לעולם לא יקבלו את אותה שורה (בחירה+נעילה+עדכון
-- בטרנזקציה אחת). תפוגת-נעילה: 15 דקות בררת-מחדל - אם טאב קרס/המשתמש
-- נעל את הנייד באמצע שיחה, השורה חוזרת לתור אוטומטית בלי התערבות ידנית.
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
  join public.campaign_stages cs on cs.campaign_id = cc.campaign_id and cs.stage_key = cc.status
  where cc.campaign_id = p_campaign_id
    and coalesce(c.frozen, false) = false
    and cs.is_won_stage = false
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

-- שחרור-תפיסה בלי שינוי (Skip/"לא ניתן להשיג עכשיו") - מנקה claimed_by/
-- claimed_at כדי שהשורה חוזרת מיד לתור, בלי קנס, בלי שינוי סטטוס/הערה.
-- בודק "התפיסה עדיין שלי" (p_caller) כדי שלא ישחרר בטעות תפיסה של מישהו
-- אחר (למשל אם claim פג ונתפס מחדש בינתיים ע"י מישהו אחר).
create or replace function public.release_campaign_contact_claim(p_row_id uuid, p_caller uuid)
returns void language sql as $$
  update public.campaign_contacts
  set claimed_by = null, claimed_at = null
  where id = p_row_id and claimed_by = p_caller;
$$;

-- ספירת-זמינים לכל קטגוריה בקמפיין (למסך בחירת-קטגוריה לפני תפיסה) -
-- אותם תנאי סינון בדיוק כמו ה-where ב-claim_next_campaign_contact, בלי
-- הנעילה/העדכון (קריאה בלבד).
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
  join public.campaign_stages cs on cs.campaign_id = cc.campaign_id and cs.stage_key = cc.status
  where cc.campaign_id = p_campaign_id
    and coalesce(c.frozen, false) = false
    and cs.is_won_stage = false
    and (cc.category is null or not (cc.category = any(p_excluded_categories)))
    and (cc.claimed_by is null or cc.claimed_at < now() - (p_stale_minutes || ' minutes')::interval)
    and (
      (select claim_scope from public.campaigns where id = p_campaign_id) <> 'assigned_only'
      or cc.assigned_to = p_caller or cc.assigned_to is null
    )
  group by cc.category;
$$;
