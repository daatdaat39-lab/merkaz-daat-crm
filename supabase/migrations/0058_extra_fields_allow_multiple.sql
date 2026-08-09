-- מסמן שדה נוסף כ"יכול להיות לאדם כמה ערכים" (למשל "קורס קצר שנרכש" -
-- אדם יכול לרכוש כמה קורסים שונים לאורך זמן, וכל ייבוא עשוי לכלול ערך
-- שונה). כברירת מחדל false - שדה כמו ת"ז שאמור להיות ערך יחיד ממשיך
-- להתנהג בדיוק כמו היום (קונפליקט רגיל, לא הצעה לפתוח עמודה נוספת).
alter table public.workspace_extra_fields
  add column if not exists allow_multiple boolean not null default false;
