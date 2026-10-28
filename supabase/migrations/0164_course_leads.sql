-- "ליד-פר-קורס": מאפשר לאיש-קשר כמה שורות-ליד פתוחות באותה מחלקה כל
-- עוד הן על קורסים שונים, בלי לשבור את ההתנהגות הקיימת של מחלקות
-- שלא מוכרות קורסים (אצלן course_id נשאר NULL תמיד). ר' דיון
-- "התהליך הראשי" - בוגר-קורס שפותח עניין בקורס-נוסף נטמע-בשקט כי
-- contact_departments מוגבל ל-unique(contact_id, workspace_id).
alter table public.contact_departments
  add column if not exists course_id uuid references public.courses(id) on delete set null;

create index if not exists contact_departments_course_idx
  on public.contact_departments(course_id) where course_id is not null;

-- מחליף את unique(contact_id, workspace_id) באינדקס-פונקציונלי שמתייחס
-- ל-NULL כסנטינל-קבוע (לא כ"כל NULL מובחן מכל NULL אחר" - ההתנהגות
-- הרגילה של Postgres שהייתה פותחת כפילויות-בשקט למחלקות-בלי-קורסים).
-- זה שומר בדיוק על ההתנהגות הקיימת למחלקות בלי קורסים (course_id
-- תמיד NULL -> בפועל כאילו unique(contact_id, workspace_id) לא השתנה),
-- ומאפשר כמה שורות לאותו contact+workspace כל עוד ה-course_id שלהן שונה.
alter table public.contact_departments
  drop constraint if exists contact_departments_contact_id_workspace_id_key;

create unique index if not exists contact_departments_contact_workspace_course_idx
  on public.contact_departments (
    contact_id, workspace_id,
    coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- איזה מחלקות בכלל "מוכרות קורסים" - שולט רק על ה-UI (איזה כפתור
-- "פתח ליד נוסף לקורס אחר" מוצג), אין לו תפקיד באכיפת-ה-DB (האינדקס
-- למעלה כבר נכון לכולם ללא תלות בדגל הזה). יש לעדכן ידנית לפי הצורך:
-- update public.workspaces set sells_courses = true where name = '<שם המחלקה>';
alter table public.workspaces
  add column if not exists sells_courses boolean not null default false;
