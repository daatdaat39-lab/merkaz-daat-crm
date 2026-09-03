-- כפתור-עזרה לטלפנים: לחיצה שולחת וואטסאפ ל"אחראים" שהמנהל בחר לקמפיין
-- הזה (יכולים להיות כמה) - אותה תבנית לכולם, עם שם-הנציג-המבקש כמשתנה
-- היחיד בתבנית.
alter table public.campaigns
  add column if not exists help_contact_ids uuid[] not null default '{}'::uuid[];

-- רישום תבנית "כפתור עזרה" (282787) - מאושרת ב-InforU, טרם רשומה אצלנו
-- (whatsapp_templates, ר' migration 0115) - משתנה יחיד ([#1#] = שם הנציג
-- המבקש עזרה, ולא "שם פרטי של איש-קשר" כמו בשאר התבניות - sendWhatsAppTemplate
-- הגנרי מתאים גם כאן, פשוט מעבירים אליו את שם-הנציג בפרמטר FirstName).
insert into public.whatsapp_templates (name, template_id, param_count, sort_order)
values ('כפתור עזרה', '282787', 1, 200)
on conflict do nothing;
