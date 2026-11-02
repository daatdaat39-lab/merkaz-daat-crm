-- ניקוי-חד-פעמי, גרסה-חסינה (מחליפה-בפועל את 0169/0170 - שתיהן רצו
-- ומחקו 0 שורות, כנראה-כי-התאמת-מחרוזת-עברית-מדויקת ב-like לא-תאמה
-- בעורך-ה-SQL - RTL+פיסוק). כאן אין שום טקסט-עברי-בתנאי בכלל - הזיהוי
-- הוא מבני-בלבד: כמה שורות-lead_inquiries עם אותו (contact_department_id,
-- reason) שנוצרו כולן בטווח-צפוף של פחות-משעה - סימן-חזק-לכפילות-
-- אוטומטית (סנכרון-חוזר/סקריפט-חד-פעמי), לא-פעילות-אמיתית-שחוזרת-על-
-- עצמה-באקראי לאורך זמן.
--
-- שומר תמיד את השורה המוקדמת-ביותר בכל-קבוצה, מוחק רק את השאר. קבוצה
-- עם שורה-אחת-בלבד, או ששורותיה מפוזרות על-פני יותר-משעה, לא-נוגעים-בה.
--
-- מומלץ להריץ קודם את ה-SELECT (למטה, בהערה) כדי לראות כמה שורות
-- יימחקו ולבדוק כמה-דוגמאות-מהטקסט-שלהן, לפני שמריצים את ה-DELETE.

-- select g.reason, g.grp_count, g.first_at, g.last_at, count(*) as rows_to_delete
-- from (
--   select id, contact_department_id, reason, created_at,
--     row_number() over (partition by contact_department_id, reason order by created_at asc) as rn,
--     min(created_at) over (partition by contact_department_id, reason) as first_at,
--     max(created_at) over (partition by contact_department_id, reason) as last_at,
--     count(*) over (partition by contact_department_id, reason) as grp_count
--   from public.lead_inquiries
-- ) g
-- where g.rn > 1 and g.grp_count > 1 and (g.last_at - g.first_at) < interval '1 hour'
-- group by g.reason, g.grp_count, g.first_at, g.last_at
-- order by count(*) desc;

with grouped as (
  select id, contact_department_id, reason, created_at,
    row_number() over (partition by contact_department_id, reason order by created_at asc) as rn,
    min(created_at) over (partition by contact_department_id, reason) as first_at,
    max(created_at) over (partition by contact_department_id, reason) as last_at,
    count(*) over (partition by contact_department_id, reason) as grp_count
  from public.lead_inquiries
)
delete from public.lead_inquiries li
using grouped g
where li.id = g.id
  and g.rn > 1
  and g.grp_count > 1
  and (g.last_at - g.first_at) < interval '1 hour';
