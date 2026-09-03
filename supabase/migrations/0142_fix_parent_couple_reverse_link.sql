-- תיקון ל-0141: הרצת שני ה-UPDATE יחד גרמה לבאג - ה-CTE של המשפט השני
-- נבנה-מחדש מול המצב שכבר עודכן ע"י המשפט הראשון, ולכן safe_couples
-- (שדורש related_contact_id is null משני הצדדים) יצא ריק בשביל כל
-- הזוגות שכבר טופלו - הקישור נכתב רק בכיוון אחד (97 הורים, לא 194).
-- מאומת: 95 זוגות עם כיוון אחד בלבד (2 ה"זוגות" הנותרים מתוך ה-97 הם
-- למעשה אותו contact_id פעמיים - "אב" ו"אם" זהים לאותו בוגר, כנראה טעות
-- בייבוא המקורי - 0141 דילג עליהם נכון בזכות ה-WHERE parent_a<>parent_b,
-- לא נוגעים בהם כאן, דורש בדיקה ידנית נפרדת).
-- תיקון גנרי (לא רשימת-UUIDs קשיחה): לכל contact בקטגוריה "הורי
-- התלמידים" שעדיין related_contact_id=null, אם יש contact אחר באותה
-- קטגוריה שכבר מצביע עליו (בן/בת זוג, מכיוון אחד), משלימים את הכיוון
-- החוזר. מוגבל לקטגוריה הזו בלבד (לא לכל 6,417 אנשי-הקשר) כדי שלא
-- לגעת בשום קישור-זוגיות אחר וקיים במערכת.
update public.contacts c
set related_contact_id = linked.id, relation_label = 'בן/בת זוג'
from public.contacts linked
where linked.related_contact_id = c.id
  and c.related_contact_id is null
  and linked.relation_label = 'בן/בת זוג'
  and exists (
    select 1 from public.campaign_contacts cc
    where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
      and cc.category = 'הורי התלמידים'
      and cc.contact_id = c.id
  )
  and exists (
    select 1 from public.campaign_contacts cc2
    where cc2.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
      and cc2.category = 'הורי התלמידים'
      and cc2.contact_id = linked.id
  );
