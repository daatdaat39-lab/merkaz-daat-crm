-- בלם-כפילות ברמת-ה-DB למניעת שורת-course_purchases כפולה לאותו ליד
-- (double-click/double-submit ב-completeLeadRegistration, או מרוץ-תזמון בין
-- שתי בקשות-מקבילות שהבדיקה-באפליקציה לא-תמיד-תספיק-להן) - גב-נוסף מעל
-- הבדיקה-הקיימת-באפליקציה (completeLeadRegistration/ensureCoursePurchaseOnWin),
-- לא תחליף-לה. נאלידי (where ... is not null) - שורות-היסטוריות/ייבוא בלי
-- contact_department_id לא-מוגבלות.
--
-- *** לפני הרצת המיגרציה הזו - הריצו קודם את שאילתת-הבדיקה הבאה, ווידאו
-- שהיא מחזירה 0 שורות. אם יש כפילויות קיימות, יצירת האינדקס תיכשל עד
-- שינוקו ידנית: ***
--
-- select contact_department_id, count(*) from public.course_purchases
-- where contact_department_id is not null group by 1 having count(*) > 1;

create unique index if not exists course_purchases_contact_department_unique_idx
  on public.course_purchases(contact_department_id)
  where contact_department_id is not null;
