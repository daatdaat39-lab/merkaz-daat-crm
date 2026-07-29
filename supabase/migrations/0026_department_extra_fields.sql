-- ============================================================
-- Migration: שדות נוספים ייעודיים לכל מחלקה על שיוך מחלקה (contact_departments),
-- כמו "מסלול לימודים מבוקש" או "סכום צפוי לתרומה". נשמר כ-jsonb גמיש
-- (extra_fields) כדי שהוספת/שינוי שדה בעתיד לא תדרוש מיגרציה נוספת -
-- ההגדרה של אילו שדות שייכים לאיזו מחלקה נמצאת בקוד (pipelines.js).
-- ============================================================

alter table public.contact_departments
  add column if not exists extra_fields jsonb not null default '{}'::jsonb;
