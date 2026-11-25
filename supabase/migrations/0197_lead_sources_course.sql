-- מקור ליד (דף נחיתה / מפרסם) יכול להיות משויך גם לקורס: טופס אחד באתר
-- משרת הרבה דפי נחיתה, ולכן הקורס של ליד מהאתר נקבע לפי הדף שממנו נשלח
-- (התאמת link_pattern), לא לפי הטופס. ר' api/webhooks/elementor-lead.
alter table public.lead_sources
  add column if not exists course_id uuid references public.courses(id) on delete set null;
