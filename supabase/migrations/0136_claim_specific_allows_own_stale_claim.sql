-- תיקון: claim_specific_campaign_contact (תפיסה דרך חיפוש) חסמה תפיסה-
-- מחדש גם כשהתופס-הנוכחי הוא **אותו נציג עצמו** - למשל אם טאב נסגר בלי
-- ש-beforeunload הספיק לרוץ (נפוץ בנייד, לא אמין) ותפיסה-עצמית ישנה
-- נשארה תקועה. הנציג היה מקבל "בשיחה אצל נציג אחר" גם כשזה בפועל
-- תפוס אצלו-עצמו, בלי דרך לחזור. עכשיו: תפיסה-עצמית לעולם לא נחסמת -
-- רק תפיסה אמיתית של נציג אחר.
create or replace function public.claim_specific_campaign_contact(
  p_row_id uuid,
  p_caller uuid,
  p_stale_minutes int default 60
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
  v_claimed_by uuid;
  v_claimed_at timestamptz;
  v_found boolean := false;
begin
  select cc.claimed_by, cc.claimed_at, true into v_claimed_by, v_claimed_at, v_found
  from public.campaign_contacts cc
  where cc.id = p_row_id
  for update skip locked;

  if not v_found then
    return; -- לא נמצא, או ננעל כרגע ע"י תפיסה מקבילה אחרת
  end if;
  if v_claimed_by is not null and v_claimed_by <> p_caller and v_claimed_at >= now() - (p_stale_minutes || ' minutes')::interval then
    return; -- כבר תפוס בפועל ע"י נציג אחר
  end if;

  update public.campaign_contacts
  set claimed_by = p_caller, claimed_at = now()
  where id = p_row_id;

  return query
  select cc.id, cc.contact_id, cc.category, cc.status, cc.note, cc.claimed_at,
    c.first, c.last, c.phone, c.phone2, c.email,
    c.related_contact_id, c.relation_label,
    spouse_cc.id, spouse_cc.status, spouse_cc.claimed_by
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  left join public.campaign_contacts spouse_cc
    on spouse_cc.campaign_id = cc.campaign_id and spouse_cc.contact_id = c.related_contact_id
  where cc.id = p_row_id;
end;
$$;
