-- תאריכי התחלה/סיום לכל מסלול של קורס (לכל מסלול תאריכים משלו).
-- משמשים: (1) סיום רישום כותב אותם ל-course_purchases.enrollment_*_date,
-- (2) המעבר האוטומטי של ליד משלב "נרשם" ל"תלמיד פעיל" בתאריך ההתחלה
-- (app/api/cron/advance-registered-students). אדיטיבי בלבד, בטוח להרצה חוזרת.

alter table public.course_tracks
  add column if not exists start_date date,
  add column if not exists end_date date;

-- Rollback (לא להריץ אלא אם צריך לבטל):
-- alter table public.course_tracks drop column if exists start_date, drop column if exists end_date;
