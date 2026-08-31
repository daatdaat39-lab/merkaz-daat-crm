-- תורם שכבר תרם ספציפית דרך "קמפיין צרידי אלול פ"ו" (מזוהה ב-kesherSyncCore.js
-- לפי Project מקשר שמכיל "צריד" - ר' TZRIDEI_CAMPAIGN_NAME/resolveRouting)
-- לא צריך שיתקשרו אליו שוב על אותה בקשה בשום קמפיין פתוח-לטלפניה - גם
-- אם הוא נמצא שם תחת קטגוריה אחרת. גיבוי-לאחור (backfill) חד-פעמי;
-- הזרימה השוטפת מטופלת אוטומטית מעכשיו בקוד (markDoNotCallForCharidyDonor
-- ב-kesherSyncCore.js) בכל סנכרון עתידי. אומת מריצה חיה: כרגע רק תורם
-- אחד חופף בין שני הקמפיינים, וזה כבר in_call_queue=false - השאילתה
-- הזו לא-פעילה (no-op) היום, ומכינה לעתיד.
update public.campaign_contacts cc
set in_call_queue = false,
    note = '[הוצא אוטומטית - כבר תרם/ה דרך צ''רידי] ' || coalesce(cc.note, '')
where cc.in_call_queue = true
  and exists (select 1 from public.campaigns c2 where c2.id = cc.campaign_id and c2.open_for_telemarketing = true)
  and exists (
    select 1 from public.campaign_contacts tz
    join public.campaigns tzc on tzc.id = tz.campaign_id
    where tzc.name = 'קמפיין צרידי אלול פ"ו' and tz.contact_id = cc.contact_id
  );
