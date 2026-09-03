-- שחרור-חד-פעמי של תפיסות תקועות (claimed_by) בקמפיין - שורות שנתפסו
-- ע"י נציג בזמן שיחה (לא assigned_to/שיוך-מנהלי, ר' תור-אישי migration
-- 0137) ומעולם לא שוחררו בחזרה (סגירת-טאב בלי beforeunload, קריסה וכו').
-- נבדק חי: 35 תפיסות היום, כולן ישנות מעל שעה (staleness threshold
-- הרגיל של המערכת, ר' p_stale_minutes=60 ב-claim_next_campaign_contact
-- migration 0140) - אף אחת מהן לא באמצע שיחה פעילה כרגע. אין צורך
-- לגעת ב-in_call_queue - נשאר כמו שהוא, רק ה"נעילה" מתבטלת כדי שכל
-- נציג יוכל לתפוס את השורה מחדש.
update public.campaign_contacts
set claimed_by = null, claimed_at = null
where campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'
  and claimed_by is not null
  and claimed_at < now() - interval '60 minutes';
