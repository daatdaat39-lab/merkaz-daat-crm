-- מאפשר "סגירת פנייה" בבאנר "פניות חדשות מאנשי קשר שכבר מתקדמים"
-- (sales/leads/page.js) - סימון ידני שהפנייה טופלה, בלי לשנות את השלב
-- של איש הקשר. פנייה מסומנת לא תופיע יותר בבאנר, עד שתגיע פנייה חדשה
-- (dismissed_at לא משפיע על שום שאילתה/תצוגה אחרת ב-lead_inquiries).
alter table public.lead_inquiries
  add column if not exists dismissed_at timestamptz;
