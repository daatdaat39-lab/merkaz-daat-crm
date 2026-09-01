-- תיקון נזק: היום נוסה למשוך "בתור-שיחות" (in_call_queue) מהגיליון (ר'
-- actions.js) - התברר כמסוכן ובוטל באותו commit, כי השדה הזה מתעדכן גם
-- אוטומטית בכל תוצאת-שיחה טרמינלית, והתא בגיליון הוא צילום-מסך ישן
-- שלא מתעדכן חי. משיכה אחת דרסה בטעות שורה שסומנה "לא מעוניין לתרום"
-- (should be in_call_queue=false) בחזרה ל-true מתא-גיליון ישן. אומת
-- ישירות מול הנתונים החיים - שורה אחת בלבד הושפעה בפועל בקמפיין הזה.
update public.campaign_contacts cc
set in_call_queue = false
where cc.campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
  and cc.in_call_queue is distinct from false
  and exists (
    select 1 from public.campaign_call_attempts a
    where a.campaign_contact_id = cc.id
      and a.outcome in ('not_interested', 'donating_now', 'requested_link', 'wrong_number', 'duplicate_contact', 'active_donation', 'number_issue')
      and a.created_at = (select max(a2.created_at) from public.campaign_call_attempts a2 where a2.campaign_contact_id = cc.id)
  );
