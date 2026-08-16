-- מספר מסמך (external_doc_number) אינו ייחודי גלובלית במערכת המקור
-- ("מערכת עסקים") - אומת מול קובץ ייצוא אמיתי: 10 מקרים בהם אותו מספר
-- מסמך שייך לשני אנשי קשר שונים לגמרי. האינדקס הישן (מיגרציה 0031, על
-- external_doc_number בלבד) גרם לכך שהתנועה של האדם השני נדחתה בשקט
-- כ"כפילות" ע"י ignoreDuplicates - תרומה אמיתית אבדה. התיקון: ייחודיות
-- נאכפת פר-איש-קשר (+פר-מקור), לא גלובלית.
--
-- לא חלקי (לא where external_doc_number is not null) - כדי ש-ON CONFLICT
-- (contact_id, source_system, external_doc_number) הרגיל של
-- supabase-js.upsert() יתאים לאינדקס בלי צורך בתנאי WHERE נוסף (אינדקס
-- חלקי דורש חזרה מפורשת על התנאי בתוך ה-ON CONFLICT עצמו, ו-PostgREST
-- לא חושף דרך לעשות זאת דרך הפרמטר onConflict). לפי סמנטיקת NULL
-- הרגילה, שורות בלי external_doc_number ממילא לא נחסמות זו מול זו גם
-- באינדקס לא-חלקי - אין צורך ב-where בשביל זה (אותו עיקרון כמו 0031).
--
-- לפני ההרצה - יש לוודא שאין כבר כפילויות קיימות תחת המפתח החדש:
--   select contact_id, source_system, external_doc_number, count(*)
--   from donation_transactions where external_doc_number is not null
--   group by 1,2,3 having count(*) > 1;
--
-- ⚠ קריטי: יש להריץ מיגרציה זו יחד עם פריסת הקוד המקביל ב-
-- leadIntakeCore.js (onConflict: 'contact_id,source_system,external_doc_number')
-- - לא בנפרד. אם קוד ישן (onConflict הישן) רץ אחרי שהאינדקס הישן כבר
-- נמחק, כל קריאה ל-insertDonationTransaction תיכשל.

drop index if exists public.donation_transactions_doc_number_idx;

create unique index if not exists donation_transactions_contact_source_doc_idx
  on public.donation_transactions (contact_id, source_system, external_doc_number);
