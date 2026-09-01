-- שומר על נעילת-תפיסה חיה כל עוד הכרטיס פתוח בפועל אצל הטלפן/ית -
-- claim_next_campaign_contact (0116) משחרר תפיסה לתפיסה-מחדש ע"י כל אחד
-- אחרי 15 דקות (p_stale_minutes), בלי לנקות claimed_by באופן אקטיבי. אם
-- כרטיס נשאר פתוח מעל 15 דקות בלי שליחה וטלפן/ית אחר/ת תפס/ה אותו
-- בינתיים, הטלפן המקורי נכשל בשמירה כי claimed_by כבר שייך למישהו אחר -
-- זה בדיוק התסמין "הכרטיס ננעל גם אצלי ולא נותן לי להזין פרטים". הפתרון:
-- ActiveCallPanel.js שולח heartbeat כל כמה דקות כל עוד הכרטיס פתוח, כדי
-- שרק כרטיס שבאמת ננטש (טאב קרס/נסגר, אין heartbeat) יתפוגג באמת.
-- מתעדכן רק אם claimed_by עדיין p_caller - נציג-אחר שכבר תפס בינתיים לא
-- "יאבד" בטעות את התפיסה שלו בגלל heartbeat מאוחר מהנציג המקורי.
create or replace function public.heartbeat_campaign_contact_claim(p_row_id uuid, p_caller uuid)
returns boolean
language plpgsql as $$
declare v_updated boolean := false;
begin
  update public.campaign_contacts
  set claimed_at = now()
  where id = p_row_id and claimed_by = p_caller
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;
