-- ניקוי-חד-פעמי נוסף (לא-שינוי-סכמה, ר' גם 0169): מחיקת-שורות-"פנייה"
-- כפולות ב-lead_inquiries עם טקסט בתבנית "קמפיין X - <מחלקה> (היסטורי...)"
-- - נמצא-בפועל אצל "ישראל ערד": 9 שורות זהות בטווח של פחות-מ-2-דקות
-- (19.8.2026) לכל אחת משתי הגרסאות ("היסטורי" ו-"היסטורי, תיקון תאריכים").
-- חיפוש מלא בקוד הפרויקט לא מצא שום מקום שיוצר את הטקסט הזה כיום -
-- כנראה שארית מפעולת-תיקון-חד-פעמית-ישנה (סקריפט חיצוני/SQL ידני),
-- לא באג חי שצריך לתקן בקוד.
--
-- שומר רק את השורה המוקדמת-ביותר (created_at) בכל קבוצה (contact_
-- department_id + reason) - מוחק רק שורות שהטקסט שלהן מתחיל ב-"קמפיין"
-- ומכיל "(היסטורי", כדי לא-לגעת בשום פנייה אחרת.
--
-- מומלץ להריץ קודם רק את ה-SELECT (למטה, בהערה) כדי לראות כמה שורות
-- יימחקו בכל בסיס-הנתונים, לפני שמריצים את ה-DELETE בפועל.

-- select count(*) from (
--   select id, row_number() over (
--     partition by contact_department_id, reason order by created_at asc
--   ) as rn
--   from public.lead_inquiries
--   where reason like 'קמפיין %' and reason like '%(היסטורי%'
-- ) dup where dup.rn > 1;

delete from public.lead_inquiries li
using (
  select id,
    row_number() over (
      partition by contact_department_id, reason
      order by created_at asc
    ) as rn
  from public.lead_inquiries
  where reason like 'קמפיין %' and reason like '%(היסטורי%'
) dup
where li.id = dup.id
  and dup.rn > 1;
