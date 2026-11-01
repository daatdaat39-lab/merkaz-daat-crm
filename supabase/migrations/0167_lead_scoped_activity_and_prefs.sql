-- שלושה שינויים-עצמאיים-תוספתיים שנאספו בסבב-סקירת-מסכים (ר' plan):

-- (1) שיוך שיחות-טלפון (015) למחלקה - עד-היום phone_calls לא-ידעה-בכלל
-- לאיזו-מחלקה שיחה-שייכת. מחושב/נכתב בקוד (webhook + dialContact),
-- לא כאן - המיגרציה רק-מוסיפה את העמודה.
alter table public.phone_calls
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
create index if not exists phone_calls_workspace_idx on public.phone_calls(workspace_id) where workspace_id is not null;

-- (2) "חוקת-הליד" - מייל/וואטסאפ/פגישה שנשלחו-מתוך-מסך-ליד-ספציפי
-- מקבלים שיוך-לשורת-הליד-המדויקת (לא רק-למחלקה) - כדי שציר-הזמן
-- במסך-ליד-אחד לא-יראה פעילות-שהייתה-על-ליד-אחר (אפילו-באותה-מחלקה,
-- קורס-אחר). NULL כש-נשלח-מהכרטיס-הכללי (לא-מתוך-ליד-ספציפי) - לגיטימי,
-- לא-"שייך"-לאף-ליד-ספציפי.
alter table public.meetings
  add column if not exists contact_department_id uuid references public.contact_departments(id) on delete set null;
alter table public.sent_emails
  add column if not exists contact_department_id uuid references public.contact_departments(id) on delete set null;
alter table public.sent_whatsapp
  add column if not exists contact_department_id uuid references public.contact_departments(id) on delete set null;
create index if not exists meetings_dept_idx on public.meetings(contact_department_id) where contact_department_id is not null;
create index if not exists sent_emails_dept_idx on public.sent_emails(contact_department_id) where contact_department_id is not null;
create index if not exists sent_whatsapp_dept_idx on public.sent_whatsapp(contact_department_id) where contact_department_id is not null;

-- (3) "פרטים אישיים" - אפשרות-אישית-לכל-נציג אילו-שדות-משניים (ת.ז/
-- תאריך-לידה/כתובת-מלאה/מזהים-חיצוניים/וכו') הוא-רוצה-לראות-תמיד-פתוחים
-- במקום מאחורי "+ עוד פרטים" - אותו-דפוס-בדיוק כמו profiles.hidden_extra_fields
-- הקיים (jsonb -> כאן מערך-טקסט פשוט, כי אלו שדות-קבועים לא-דינמיים).
alter table public.profiles
  add column if not exists personal_info_always_open text[];
