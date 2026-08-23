-- ============================================================
-- ניקוי חד-פעמי נוסף (לא מיגרציית סכימה) - אחרי 0078/0079: מתוך
-- 1,649 הקונפליקטים שנשארו pending (phone/email/idnum/birth_date/
-- extra:intake_date_legacy), חלק גדול אינם קונפליקט אמיתי בכלל -
-- existing_value ו-new_value מייצגים את אותה עובדה בדיוק, רק כתובים
-- בפורמט שונה (טלפון עם/בלי 972+/מקפים, מייל ברישיות שונה, תאריך
-- לידה ISO מול M/D/YY). נבדק ישירות מול הדאטה: 963/1124 טלפונים,
-- 42/271 מיילים, 102/192 תאריכי-לידה הם "אותה עובדה" - שאר 542
-- הקונפליקטים (161 טלפון + 229 מייל + 17 ת"ז + 90 תאריך-לידה +
-- 45 intake_date_legacy - האחרון לא נבדק כאן, לא הוכח שהוא רעש
-- פורמט) נשארים pending לבדיקה אנושית אמיתית.
--
-- resolution='kept_existing' (לא used_new) בכוונה: כשהערכים זהים
-- במהות, אין שום סיבה לכתוב כלום מחדש לטבלת contacts - רק לסמן
-- שאין כאן קונפליקט אמיתי. אפס שינוי לנתונים, רק לתור.
--
-- הרץ בסדר: דרייראנים (שלב 1) -> סימון resolved לכל אחד מ-3 השדות
-- בנפרד (שלבים 2-4) -> וידוא (שלב 5).
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
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[1] as mo,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[2] as da,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[3] as yr
  from import_conflicts
  where status = 'pending' and field_key = 'birth_date'
) parsed
where mo is not null
  and (case when length(yr) = 2 then (case when yr::int < 30 then '20' else '19' end) || yr else lpad(yr, 4, '0') end)
      || '-' || lpad(mo, 2, '0') || '-' || lpad(da, 2, '0') = existing_value;
-- ציפייה: phone=963, email=42, birth_date=102

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
with parsed as (
  select id, existing_value,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[1] as mo,
    (regexp_match(new_value, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$'))[2] as da,
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

-- שלב 5 (וידוא) - הציפייה: 542 נשארים סה"כ (161 phone + 229 email +
-- 17 idnum + 90 birth_date + 45 extra:intake_date_legacy)
select field_key, count(*) from import_conflicts where status = 'pending' group by field_key order by 2 desc;
