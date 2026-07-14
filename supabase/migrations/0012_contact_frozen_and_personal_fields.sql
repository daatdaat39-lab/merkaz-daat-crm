-- ============================================================
-- Migration: הקפאת איש קשר + שדות אישיים נוספים (תאריך לידה, מגדר)
-- ============================================================

-- הקפאת איש קשר - חוסמת כל שינוי (עריכה/שלב/משימות/הערות) עד הפשרה
-- מפורשת ע"י owner/admin של אחת המחלקות שהוא משויך אליהן. האכיפה
-- בפועל נעשית בקוד השרת (Server Actions), לא ב-RLS - תואם את שאר
-- המערכת שאין בה היום שום בדיקת תפקיד ברמת המסד.
alter table public.contacts
  add column if not exists frozen boolean not null default false;

create index if not exists idx_contacts_frozen
  on public.contacts (frozen) where frozen = true;

-- שדות אישיים נוספים לתצוגה בכרטיס - גיל ותאריך עברי מחושבים בזמן
-- אמת מתוך birth_date, לא נשמרים כשדה נפרד
alter table public.contacts
  add column if not exists birth_date date,
  add column if not exists gender text;
