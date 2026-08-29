-- ============================================================
-- ניקוי חד-פעמי נוסף (לא מיגרציית סכימה) לתור import_conflicts.
--
-- תוקן (2026-08-29): הגרסה הקודמת של הקובץ הזה פירשה את new_value של
-- תאריך-לידה כ-M/D/YY (אמריקאי) - אבל נבדק ישירות מול ה-540 הקונפליקטים
-- שנשארו pending כרגע, וכל מקורות הדאטה כאן כותבים תאריך כ-D/M/YY
-- (כמו כל שאר הקוד בפרויקט - ר' parseRowDate ב-DepartmentImportWizard).
-- אימות: מתוך 90 קונפליקטי תאריך-לידה (כולם ישיבת דעת), 88 מתאימים
-- בדיוק ל-existing_value תחת פרשנות D/M/YY, אפס תחת M/D/YY. הגרסה
-- הקודמת הייתה "בטוחה אך חסרת תועלת" (0 קונפליקטים מ-90 היו נפתרים) -
-- לא הזיקה, פשוט לא עשתה כלום.
--
-- טלפון/מייל: נבדק גם כן ישירות מול ה-540 הנוכחיים - 0 מתוכם הם "אותה
-- עובדה" (הניקוי המוקדם יותר, לפני שהקובץ הזה נוצר, כבר סינן את כל
-- 963 הטלפונים ו-42 המיילים ה"אותה עובדה" שתועדו בהערה המקורית). שני
-- השלבים האלה נשארים בקובץ בכל זאת (idempotent, לא יזיקו) למקרה שמופיע
-- קונפליקט טלפון/מייל עתידי מאותו סוג רעש-פורמט.
--
-- resolution='kept_existing' (לא used_new) בכוונה: כשהערכים זהים
-- במהות, אין שום סיבה לכתוב כלום מחדש לטבלת contacts - רק לסמן
-- שאין כאן קונפליקט אמיתי. אפס שינוי לנתונים, רק לתור.
--
-- הרץ בסדר: דרייראן (שלב 1) -> סימון resolved לכל שדה (שלבים 2-4) ->
-- וידוא (שלב 5).
-- ============================================================

-- שלב 1 (דרייראן) - כמה קונפליקטים "אותה עובדה" נמצא בכל שדה
select 'phone' as field, count(*) as same_fact_count
from import_conflicts
where status = 'pending' and field_key = 'phone'
  and right(regexp_replace(existing_value, '\D', '', 'g'), 9) = right(regexp_replace(new_value, '\D', '', 'g'), 9)
  and right(regexp_replace(existing_value, '\D', '', 'g'), 9) <> ''
union all
select 'email', count(*)
from import_conflicts
where status = 'pending' and field_key = 'email'
  and lower(trim(existing_value)) = lower(trim(new_value))
union all
select 'birth_date', count(*)
from (
  select id, existing_value,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[1] as da,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[2] as mo,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[3] as yr
  from import_conflicts
  where status = 'pending' and field_key = 'birth_date'
) parsed
where mo is not null
  and (case when length(yr) = 2 then (case when yr::int < 30 then '20' else '19' end) || yr else lpad(yr, 4, '0') end)
      || '-' || lpad(mo, 2, '0') || '-' || lpad(da, 2, '0') = existing_value;
-- ציפייה (נבדק בפועל 2026-08-29): phone=0, email=0, birth_date=88

-- שלב 2 - סימון קונפליקטי-טלפון "אותה עובדה" כ-resolved/kept_existing
update import_conflicts
set status = 'resolved', resolution = 'kept_existing', resolved_at = now(),
    resolved_by = (select id from auth.users where email = 'is.arad770@gmail.com')
where status = 'pending' and field_key = 'phone'
  and right(regexp_replace(existing_value, '\D', '', 'g'), 9) = right(regexp_replace(new_value, '\D', '', 'g'), 9)
  and right(regexp_replace(existing_value, '\D', '', 'g'), 9) <> '';

-- שלב 3 - סימון קונפליקטי-מייל "אותה עובדה" כ-resolved/kept_existing
update import_conflicts
set status = 'resolved', resolution = 'kept_existing', resolved_at = now(),
    resolved_by = (select id from auth.users where email = 'is.arad770@gmail.com')
where status = 'pending' and field_key = 'email'
  and lower(trim(existing_value)) = lower(trim(new_value));

-- שלב 4 - סימון קונפליקטי-תאריך-לידה "אותה עובדה" כ-resolved/kept_existing
-- (D/M/YY - ר' הערת התיקון למעלה)
with parsed as (
  select id, existing_value,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[1] as da,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[2] as mo,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[3] as yr
  from import_conflicts
  where status = 'pending' and field_key = 'birth_date'
),
matching as (
  select id from parsed
  where mo is not null
    and (case when length(yr) = 2 then (case when yr::int < 30 then '20' else '19' end) || yr else lpad(yr, 4, '0') end)
        || '-' || lpad(mo, 2, '0') || '-' || lpad(da, 2, '0') = existing_value
)
update import_conflicts ic
set status = 'resolved', resolution = 'kept_existing', resolved_at = now(),
    resolved_by = (select id from auth.users where email = 'is.arad770@gmail.com')
from matching m
where ic.id = m.id;

-- שלב 5 (וידוא) - הציפייה: 452 נשארים סה"כ (160 phone + 228 email +
-- 17 idnum + 2 birth_date + 45 extra:intake_date_legacy) - כולם
-- קונפליקטים אמיתיים שדורשים בדיקה אנושית, לא רעש פורמט.
select field_key, count(*) from import_conflicts where status = 'pending' group by field_key order by 2 desc;
