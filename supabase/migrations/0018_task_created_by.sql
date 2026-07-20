-- ============================================================
-- Migration: מפרידה בין "מי יצר את המשימה" (created_by, קבוע) לבין
-- "למי היא מוקצית" (assigned_to, ניתן לבחירה/שינוי) - עד כה assigned_to
-- שימש בפועל כ"יוצר" בלבד, בלי דרך לייעד משימה למישהו אחר.
-- ============================================================

alter table public.tasks
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.tasks set created_by = assigned_to where created_by is null;
