-- הרחבה ל-courses/course_purchases הקיימות (ממיגרציה 0148) - לא יוצר
-- טבלאות חדשות, רק מוסיף את מה שסוכם לגבי משך-קורס וסטטוס-הרשמה-מחושב:
-- "בוגר" לעולם לא נכתב ל-course_purchases.status (זה כבר בשימוש-חי
-- לסטטוס-המכירה pending/completed מ-convert_lead_to_purchase) - הוא ממד
-- נפרד-לגמרי, מחושב-ברינדור מהעמודות החדשות האלה.
alter table public.courses
  add column if not exists duration_type text not null default 'fixed_dates'
    check (duration_type in ('fixed_dates', 'self_paced', 'duration_from_purchase')),
  add column if not exists duration_days int;

alter table public.course_purchases
  add column if not exists cohort_label text,
  add column if not exists enrollment_start_date date,
  add column if not exists enrollment_end_date date;
