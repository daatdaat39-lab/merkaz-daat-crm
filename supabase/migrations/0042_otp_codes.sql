-- אימות משתמשים בקוד חד-פעמי (OTP) - מייל בלבד בשלב ראשון (SMS לא
-- מוגדר במערכת כיום, ר' lib/otp.js). הטבלה נגישה אך ורק דרך
-- createAdminClient() (service role) בפעולות שרת - קוד אימות אסור
-- שיהיה קריא ללקוח בשום צורה, אפילו לא לבעליו, ולכן בכוונה אין כאן
-- שום RLS policy מתירנית (בניגוד למוסכמה הרגילה בפרויקט של
-- auth.uid() is not null לכולם).
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  purpose text not null,             -- 'login' | 'sensitive_action'
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts int not null default 0,   -- חוסם אחרי 5 ניסיונות שגויים
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_user_purpose_idx on public.otp_codes(user_id, purpose, expires_at);
alter table public.otp_codes enable row level security;
