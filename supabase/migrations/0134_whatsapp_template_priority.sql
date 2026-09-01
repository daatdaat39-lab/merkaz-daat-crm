-- מוסיף עדיפות-תצוגה לתבניות WhatsApp (ברירת-מחדל 100 לכל הקיימות,
-- לא משנה את הסדר הנוכחי שלהן) - כדי שאפשר יהיה לדחוף תבנית ספציפית
-- לראש הרשימה (ולהיות הנבחרת כברירת-מחדל, ר' WhatsAppSendModal.js:
-- useState(templates[0]?.id)) בלי לגעת בשום תבנית קיימת. מוסיפים כאן
-- גם את התבנית החדשה "הקדשת יום" (282299, מאושרת ב-InforU, בלי
-- משתנים - param_count=0) עם sort_order=0 כדי שתופיע ראשונה/נבחרת
-- אוטומטית אצל הטלפניות.
alter table public.whatsapp_templates
  add column if not exists sort_order int not null default 100;

insert into public.whatsapp_templates (name, template_id, preview_text, param_count, sort_order)
select 'הקדשת יום', '282299',
  'שלום וברכה, בהמשך לשיחתנו על הקדשת יום - שכל כולו יהיה מוקדש לזכותם! העלות היא 65 שקלים למשך 12 חודשים בלבד.',
  0, 0
where not exists (select 1 from public.whatsapp_templates where template_id = '282299');
