-- באג אמיתי, אומת בפועל דרך פאנל InforU (Operator Response: #132000 -
-- "Number of parameters does not match the expected number of params"):
-- sendWhatsAppTemplate שלח תמיד בדיוק 2 פרמטרים ([#1#]=שם פרטי,
-- [#2#]=סיבה), מתאים רק לתבנית ברירת-המחדל המקורית (272006, שיש לה
-- בדיוק 2 מקומות [#1#]/[#2#]). תבניות חדשות עם מספר-פרמטרים שונה
-- נכשלות במסירה בשקט - "בהמשך לשיחתנו" (281855) בלי אף פרמטר, "הזמנה
-- לבחירת יום" (281806) עם פרמטר אחד בלבד. param_count חדש שומר כמה
-- פרמטרים לתבנית הזו בפועל, ברירת מחדל 2 (לא שובר תבניות קיימות).
alter table public.whatsapp_templates
  add column if not exists param_count int not null default 2;

update public.whatsapp_templates set param_count = 0 where template_id = '281855';
update public.whatsapp_templates set param_count = 1 where template_id = '281806';
