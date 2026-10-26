-- ציון-סבירות-לסגור: הערכת-נציג ידנית (חם/פושר/קר) - לא ממוזגת עם
-- הערכת-AI (תוכננה בנפרד, לא-נבנתה-עדיין) - ר' דיון "ציון-סבירות-לסגור"
-- בתוכנית. rep_confidence_updated_at מאפשר להציג "מעודכן לפני X ימים"
-- (מנגנון-staleness) כדי שלא יישאר-מוצג-כ"חם" בלי שהנציג יידע שזה-ישן.
alter table public.contact_departments
  add column if not exists rep_confidence text check (rep_confidence in ('hot', 'warm', 'cold')),
  add column if not exists rep_confidence_updated_at timestamptz;
