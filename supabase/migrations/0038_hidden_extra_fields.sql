-- שדות מותאמים אישית לכל נציג: כל משתמש יכול לבחור להסתיר לעצמו שדות
-- "מחלקתיים" (EXTRA_FIELDS ב-components/pipelines.js, למשל סכום תרומה /
-- קורס נוכחי) בקוביות התצוגה בכרטיס איש קשר, בלי להשפיע על מה שנציגים
-- אחרים רואים. שדות ליבה (שם/טלפון/מייל/תגיות) לא ניתנים להסתרה בכלל -
-- העמודה הזו רלוונטית רק לשדות ה-EXTRA_FIELDS הרשמיים.
--
-- זו העדפה אישית, לא נתון משותף - אין guard של owner/admin בכתיבה
-- אליה (בדיוק כמו profiles.current_workspace_id הקיים, שגם הוא נכתב
-- ישירות ע"י המשתמש על עצמו).
--
-- צורת הנתון: { [workspace_id]: [field_key, ...] } - המפתחות שהמשתמש
-- הזה בחר להסתיר, לכל מחלקה בנפרד.
alter table public.profiles
  add column if not exists hidden_extra_fields jsonb not null default '{}'::jsonb;
