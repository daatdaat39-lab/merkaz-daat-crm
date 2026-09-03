-- רישום תבנית "פרטים להעברה בנקאית" (282922, מאושרת ב-InforU, בלי
-- משתנים) - sort_order=50 ממקם אותה בדיוק שנייה בבורר-התבניות (אחרי
-- "הקדשת יום" ב-0, לפני שלוש התבניות עם sort_order=100 הקיימות).
insert into public.whatsapp_templates (name, template_id, param_count, sort_order)
values ('פרטים להעברה בנקאית', '282922', 0, 50)
on conflict do nothing;
