-- ============================================================
-- ניקוי חד-פעמי (לא מיגרציית סכימה) - פתרון אוטומטי לקונפליקטים
-- על שדות "תמונת-מצב פיננסית" (אמצעי תשלום נוכחי - תוקף כרטיס,
-- 4 ספרות אחרונות, פרטי בנק) - אלה לא עובדה יציבה על הזהות, אלא
-- מצב שמשתנה באמת עם הזמן אצל תורם (כרטיס הוחלף וכו'), ולכן הערך
-- העדכני ביותר בקובץ מנצח - לא "הקיים תמיד מנצח" (הכלל הרגיל
-- לשאר השדות, שנשאר בעינו לגבי טלפון/מייל/ת"ז/תאריך לידה וכו').
--
-- הרץ אחרי 0078 בלבד (מניח שאין עוד שכפולים מדויקים בטבלה).
-- הרץ בסדר: דרייראנים (שלב 1) -> מחיקת "מפסידים" (שלב 2) -> כתיבת
-- הערך המנצח ל-contact_departments.extra_fields (שלב 3) -> סימון
-- resolved (שלב 4) -> וידוא (שלב 5).
-- ============================================================

-- שלב 1 (דרייראן) - כמה שורות "מפסידות" (לא הכי חדשות בכל קבוצת
-- contact+workspace+field) יימחקו, וכמה "מנצחות" (קבוצות ייחודיות)
-- יישארו לפתרון אוטומטי
with financial_keys as (
  select unnest(array[
    'extra:payment_method_expiry','extra:card_last4','extra:bank_branch','extra:bank_number',
    'extra:bank_account_ref','extra:bank_name','extra:bank_account_client','extra:legacy_card_type',
    'extra:payment_vehicle_name','extra:branch_code'
  ]) as field_key
),
ranked as (
  select ic.id, ic.contact_id, ic.workspace_id, ic.field_key,
         row_number() over (
           partition by ic.contact_id, ic.workspace_id, ic.field_key
           order by ic.created_at desc, ic.id desc
         ) as rn
  from import_conflicts ic
  join financial_keys fk using (field_key)
  where ic.status = 'pending'
)
select
  count(*) filter (where rn > 1) as would_delete_losers,
  count(*) filter (where rn = 1) as winners_to_resolve
from ranked;

-- שלב 2 - מחיקת השורות ה"מפסידות" (אותו contact+workspace+field,
-- ערך ישן יותר שכבר הוחלף בערך מאוחר יותר לפי סדר הקובץ) - קולפס
-- ל"קונפליקט אחד לכל contact+field", כולל את מקרי ההתקדמות
-- האמיתית (כרטיס שהוחלף כמה פעמים).
with financial_keys as (
  select unnest(array[
    'extra:payment_method_expiry','extra:card_last4','extra:bank_branch','extra:bank_number',
    'extra:bank_account_ref','extra:bank_name','extra:bank_account_client','extra:legacy_card_type',
    'extra:payment_vehicle_name','extra:branch_code'
  ]) as field_key
),
ranked as (
  select ic.id,
         row_number() over (
           partition by ic.contact_id, ic.workspace_id, ic.field_key
           order by ic.created_at desc, ic.id desc
         ) as rn
  from import_conflicts ic
  join financial_keys fk using (field_key)
  where ic.status = 'pending'
)
delete from import_conflicts
where id in (select id from ranked where rn > 1);

-- שלב 3 - כתיבת הערך המנצח (השורד היחיד לכל contact+workspace+field
-- אחרי שלב 2) לתוך contact_departments.extra_fields. מאגד כמה שדות
-- פיננסיים של אותו contact+workspace יחד ל-patch אחד (jsonb_object_agg)
-- ולא מעדכן שדה-שדה בנפרד - UPDATE...FROM עם כמה שורות-מקור תואמות
-- לאותה שורת-יעד מיישם רק שורת-מקור שרירותית אחת, לא מצטבר, ואפשר
-- היה לאבד שדות פיננסיים אחרים של אותו איש קשר בטעות.
-- מפתח ה-join אומת בסכימה: contact_departments יש unique
-- (contact_id, workspace_id) (מיגרציה 0009) ו-extra_fields jsonb not
-- null default '{}'::jsonb (מיגרציה 0026).
with financial_keys as (
  select unnest(array[
    'extra:payment_method_expiry','extra:card_last4','extra:bank_branch','extra:bank_number',
    'extra:bank_account_ref','extra:bank_name','extra:bank_account_client','extra:legacy_card_type',
    'extra:payment_vehicle_name','extra:branch_code'
  ]) as field_key
),
winners as (
  select ic.contact_id, ic.workspace_id, ic.field_key, ic.new_value
  from import_conflicts ic
  join financial_keys fk using (field_key)
  where ic.status = 'pending' and ic.workspace_id is not null
),
patches as (
  select contact_id, workspace_id,
         jsonb_object_agg(substring(field_key from 7), new_value) as patch
  from winners
  group by contact_id, workspace_id
)
update contact_departments cd
set extra_fields = cd.extra_fields || p.patch
from patches p
where cd.contact_id = p.contact_id and cd.workspace_id = p.workspace_id;

-- שלב 4 - סימון השורות המנצחות (השדות הפיננסיים, עדיין pending)
-- כ-resolved/used_new. resolved_by מנסה למצוא את is.arad770@gmail.com;
-- אם לא נמצא, נשאר NULL (העמודה מאפשרת זאת).
with financial_keys as (
  select unnest(array[
    'extra:payment_method_expiry','extra:card_last4','extra:bank_branch','extra:bank_number',
    'extra:bank_account_ref','extra:bank_name','extra:bank_account_client','extra:legacy_card_type',
    'extra:payment_vehicle_name','extra:branch_code'
  ]) as field_key
)
update import_conflicts ic
set status = 'resolved', resolution = 'used_new', resolved_at = now(),
    resolved_by = (select id from auth.users where email = 'is.arad770@gmail.com')
from financial_keys fk
where ic.field_key = fk.field_key and ic.status = 'pending';

-- שלב 5 (וידוא) - אף אחד מ-10 המפתחות הפיננסיים לא אמור להופיע
-- יותר; שאר המפתחות (phone/email/idnum/birth_date/
-- extra:intake_date_legacy וכו') צריכים להישאר בדיוק כמו שהיו
-- אחרי 0078 - הסקריפט הזה לא נוגע בהם.
select field_key, count(*) from import_conflicts where status = 'pending' group by field_key order by 2 desc;
