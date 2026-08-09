-- true = יש תהליך/ליד פעיל (ההתנהגות הקיימת של כל שיוך עד היום).
-- false = איש קשר "ותיק" שיובא בלי לפתוח לו תהליך - לא מופיע בלידים/
-- פייפליין/סטטיסטיקות, רק נגיש דרך הכרטיס/חיפוש. ברירת מחדל true
-- כדי לא לשנות אף שיוך קיים.
alter table public.contact_departments
  add column if not exists opened_process boolean not null default true;
