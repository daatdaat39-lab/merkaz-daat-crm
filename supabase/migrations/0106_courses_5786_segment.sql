-- קבוצת "קורסים תשפ"ו" בקמפיין "קמפיין למען דעת - אלול תשפ"ו" - אומת
-- מריצה חיה: 412 אנשי קשר עם רישום קורס בשנת "תשפ"ו" (contact_course_
-- enrollments.year_label, גרש רגיל - לא גרשיים) - כולם כבר חברים בקמפיין
-- (תחת קטגוריות אחרות), אף אחד עוד לא בקטגוריה הזו. משנים category
-- בלבד - לא נוגעים ב-note/mapping_decision/responsible_person/
-- in_call_queue הקיימים, כדי לשמר בדיוק את מה שכבר הוזן במיפוי הידני.
update public.campaign_contacts cc
set category = 'קורסים תשפ"ו'
where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
  and exists (
    select 1 from public.contact_course_enrollments ce
    where ce.contact_id = cc.contact_id and ce.year_label = 'תשפ"ו'
  );
