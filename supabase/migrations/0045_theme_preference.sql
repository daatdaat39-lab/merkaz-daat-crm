-- העדפת ערכת נושא אישית (בהיר/כהה/לפי מערכת), אותו דפוס בדיוק כמו
-- hidden_extra_fields/hidden_widgets - נכתב רק ע"י המשתמש על עצמו.
-- 'system' = לפי prefers-color-scheme בדפדפן, נקרא ב-app/layout.js.
alter table public.profiles
  add column if not exists theme_preference text not null default 'system'
  check (theme_preference in ('light', 'dark', 'system'));
