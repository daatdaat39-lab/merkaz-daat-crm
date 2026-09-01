-- "מי תופס מה עכשיו" למנהל - אותה סמנטיקת-תפוגה בדיוק כמו claim_next_
-- campaign_contact (p_stale_minutes=15 בררת-מחדל) - כדי שרק תפיסות
-- שבאמת "חיות" (מתוחזקות ע"י heartbeat, ר' migration 0119) יופיעו כאן
-- כ"נציג פעיל כרגע"; תפיסה שנס לה claimed_at לא תוצג בטעות כאילו הנציג
-- עדיין על הקו.
create or replace function public.get_currently_claimed_campaign_contacts(p_campaign_id uuid, p_stale_minutes int default 15)
returns table(row_id uuid, contact_id uuid, first text, last text, phone text, claimed_by uuid, claimed_at timestamptz)
language sql stable as $$
  select cc.id, cc.contact_id, c.first, c.last, c.phone, cc.claimed_by, cc.claimed_at
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id
  where cc.campaign_id = p_campaign_id
    and cc.claimed_by is not null
    and cc.claimed_at >= now() - (p_stale_minutes || ' minutes')::interval
  order by cc.claimed_at asc;
$$;
