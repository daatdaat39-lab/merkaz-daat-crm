-- שתי תבניות WhatsApp חדשות שאושרו ב-InforU (לפי צילום-מסך שהתקבל מהמשתמש)
-- - נוספות לרשימת התבניות שהטלפנים בוחרים מתוכן בשליחת WhatsApp מכרטיס
-- שיחה. preview_text הוא לתצוגה בלבד בממשק (לא נשלח בפועל) - ניתן לערוך
-- דרך הגדרות ← תבניות WhatsApp אם צריך נוסח מדויק/מלא יותר.
insert into public.whatsapp_templates (name, template_id, preview_text)
select 'בהמשך לשיחתנו - תרומה', '281855', 'בהמשך לשיחתנו, מצורפים כל הפרטים על *ימי השותפות השנתיים* ... 📞 לחיוג לחץ כאן · 📤 לתרומה לחץ כאן'
where not exists (select 1 from public.whatsapp_templates where template_id = '281855');

insert into public.whatsapp_templates (name, template_id, preview_text)
select 'הזמנה לבחירת יום בלוח שנה', '281806', 'הזמנה לתאם ולבחור יום פנוי בלוח השנה'
where not exists (select 1 from public.whatsapp_templates where template_id = '281806');
