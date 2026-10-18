-- ניקוי: calendar_dedications יתומה. migration 0036 כבר הכריזה שהפיצ'ר
-- "לוח שנה והקדשות" הוסר ושהטבלה תימחק ב-migration נפרדת - אבל ה-DROP
-- שבוצע בפועל (0081) היה על הטבלה "האחות" (campaign_dedication_entries),
-- לא על זו. אפס אזכורים בקוד החי, אומת שיש 0 שורות בפרודקשן לפני ריצה.
drop table if exists public.calendar_dedications;
