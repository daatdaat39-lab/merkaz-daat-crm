-- תיקון פער הרשאות: workspaces/workspace_members היו היחידות בכל הפרויקט
-- שסננו SELECT לפי חברות בפועל (is_workspace_member), בניגוד לדפוס הקבוע
-- בכל שאר הטבלאות - RLS פתוח (auth.uid() is not null), עם כל ההרשאה
-- האמיתית נאכפת בקוד השרת (isManagerOfWorkspace/isManagerOfAnyWorkspace
-- וכו', ר' app/dashboard/lib/contactGuards.js).
--
-- זה לא היה רק קוסמטי: כמה מסכים מסתמכים בכוונה על קריאת workspaces/
-- workspace_members חוצת-מחלקות למשתמש שאינו חבר בהן, ונשברו בפועל בגלל
-- ה-RLS המצומצם:
--   - contacts/page.js, sales/leads/LeadsBoard.js, Topbar.js: שם המחלקה
--     של איש קשר ממחלקה שהמשתמש לא חבר בה הוצג כ"מחלקה" סתמי (ה-join
--     ל-workspaces.name חזר ריק).
--   - layout.js: "מרכז דעת - ראשי" אמור תמיד להיות ניתן לבחירה בבורר
--     המחלקות גם למי שלא חבר בו בפועל - השאילתה שמביאה אותו הייתה
--     חוזרת ריקה למשתמש כזה.
--   - loadContactCardData.js: רשימת הנציגים הזמינים להקצאה (agentsByWorkspace)
--     לאיש קשר ששייך לכמה מחלקות במקביל - נשברה עבור מחלקות שהצופה
--     הנוכחי אינו חבר בהן.
--
-- מותר לפתוח את ה-SELECT כי אין בשמות המחלקות/רשימת החברות שום מידע רגיש
-- שהמערכת מסתירה במודע - ההגנה האמיתית (מי יכול לנהל/לערוך מחלקה) כבר
-- נאכפת בכל מקום דרך isManagerOfWorkspace, לא דרך RLS. ה-INSERT policy על
-- workspace_members (is_workspace_admin) לא משתנה - עדיין רק owner/admin
-- יכולים להוסיף חבר חדש.

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_authenticated"
  on public.workspaces for select
  using (auth.uid() is not null);

drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
create policy "workspace_members_select_authenticated"
  on public.workspace_members for select
  using (auth.uid() is not null);
