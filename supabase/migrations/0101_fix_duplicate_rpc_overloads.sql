-- תיקון דחוף: כשמוסיפים פרמטר חדש ל-function קיים, "create or replace"
-- ב-Postgres לא מחליף אותו - הוא יוצר overload נוסף (זוהה-לפי-רשימת-
-- טיפוסי-הפרמטרים, לא לפי שם), כי רשימת-הטיפוסים השתנתה. שלוש פונקציות
-- קיבלו כך גרסה-כפולה בטעות במהלך 0095-0100, וברגע שיש שתי גרסאות עם
-- אותם פרמטרים-בעלי-ברירת-מחדל, PostgREST כבר לא יכול להחליט איזו
-- לקרוא ("Could not choose the best candidate function") - זו בדיוק
-- התקלה שקרתה בפועל אחרי הרצת 0095-0100 (תור-השיחות הפסיק לעבוד
-- לגמרי). מוחקים כאן את הגרסאות הישנות במפורש, לפי חתימת-הטיפוסים
-- המדויקת שלהן - נשארת רק הגרסה הנוכחית (שכבר הוגדרה נכון ב-0099/0100).
drop function if exists public.claim_next_campaign_contact(uuid, uuid, text, text[], int);
drop function if exists public.count_callable_campaign_contacts_by_category(uuid, uuid, text[], int);
drop function if exists public.log_campaign_call_attempt(uuid, uuid, text, text, text, timestamptz);
drop function if exists public.log_campaign_call_attempt(uuid, uuid, text, text, text, timestamptz, text);
