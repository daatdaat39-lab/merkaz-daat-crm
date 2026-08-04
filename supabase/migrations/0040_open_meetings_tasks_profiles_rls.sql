-- תיקון פער RLS נוסף מאותה משפחה כמו 0037 (workspaces/workspace_members):
-- meetings ו-tasks נשארו על מדיניות ישנה ומצומצמת (is_workspace_member)
-- מאז מיגרציה 0003, מלפני שהתקבע הכלל "RLS פתוח לכל משתמש מחובר, הרשאה
-- אמיתית נאכפת בקוד השרת" ששאר הטבלאות כבר עברו אליו (ר' contacts ב-0006).
--
-- זה לא רק תיאורטי: loadContactCardData.js שולף meetings/tasks לפי
-- contact_id בלבד (בלי סינון workspace), בדיוק כדי שכרטיס איש קשר עם
-- כמה שיוכי-מחלקה יראה את ההיסטוריה המלאה שלו - אבל אם הצופה לא חבר
-- באחת המחלקות האלה, המדיניות הישנה הייתה מחזירה רשימה ריקה בשקט
-- לאותה מחלקה ספציפית, בדיוק כמו הבאג שתוקן ב-0037 לשמות מחלקות.
--
-- בנוסף: profiles מעולם לא הוגדרה במיגרציה עוקבת (נבדק בפועל - כבר
-- פתוחה לקריאה לכל משתמש מחובר, כנראה מהגדרה שקדמה להיסטוריית
-- המיגרציות) - הפעם רק מתעדים את זה במפורש, לא משנים התנהגות בפועל.

drop policy if exists "meetings_all_workspace_member" on public.meetings;
create policy "meetings_all_authenticated" on public.meetings for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tasks_all_workspace_member" on public.tasks;
create policy "tasks_all_authenticated" on public.tasks for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

alter table public.profiles enable row level security;
drop policy if exists "profiles_all_authenticated" on public.profiles;
create policy "profiles_all_authenticated" on public.profiles for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
