-- ============================================================
-- Migration: שדות נוספים לאנשי קשר ומשימות
-- ============================================================

-- טלפון נוסף + תאריך "טיפול אחרון" (לספירת זמן על לידים)
alter table public.contacts
  add column if not exists phone2 text;
alter table public.contacts
  add column if not exists last_activity_at timestamptz not null default now();

-- שעת יעד + תזכורת למשימות
alter table public.tasks
  add column if not exists due_time time;
alter table public.tasks
  add column if not exists remind_minutes_before integer;
