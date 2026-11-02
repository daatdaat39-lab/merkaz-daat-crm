-- ניקוי-חד-פעמי (לא-שינוי-סכמה): מחיקת-שורות-"פנייה" כפולות ב-
-- lead_inquiries שנוצרו ע"י באג שכבר-תועד-ותוקן ב-kesherSyncCore.js -
-- upsertDepartmentMembership נקרא-בלי-תנאי בכל-ריצת-סנכרון-חוזרת, גם
-- כש-ההתחייבות/תשלום כבר-היו-ידועים, ולכן-רשם-שורת-"פנייה"-זהה-לגמרי
-- בכל-ריצה (נמצא-בפועל: 819+ שורות-כאלה על תורם-בודד). התיקון-בקוד
-- (isNewCommitment, שורה 326+) כבר-מונע-כפילויות-חדשות - זה-רק-מנקה
-- את-מה-שכבר-נוצר-לפני-התיקון.
--
-- שומר רק את השורה המוקדמת-ביותר (created_at) בכל-קבוצה (contact_
-- department_id + reason) - מוחק רק שורות עם source='קשר' ואחת משלוש
-- הסיבות שקוד-הסנכרון-מ"קשר" בלבד יוצר (ר' getKesherReason), כדי
-- לא-לגעת בשום פנייה שנוצרה ידנית או ממקור אחר.
--
-- מומלץ להריץ קודם רק את ה-SELECT (למטה, בהערה) כדי לראות כמה שורות
-- יימחקו, לפני שמריצים את ה-DELETE בפועל.

-- select count(*) from (
--   select id, row_number() over (
--     partition by contact_department_id, reason order by created_at asc
--   ) as rn
--   from public.lead_inquiries
--   where source = 'קשר'
--     and reason in ('תרומה/התחייבות מקשר', 'תשלום/התחייבות מקשר', 'תשלום הורים')
-- ) dup where dup.rn > 1;

delete from public.lead_inquiries li
using (
  select id,
    row_number() over (
      partition by contact_department_id, reason
      order by created_at asc
    ) as rn
  from public.lead_inquiries
  where source = 'קשר'
    and reason in ('תרומה/התחייבות מקשר', 'תשלום/התחייבות מקשר', 'תשלום הורים')
) dup
where li.id = dup.id
  and dup.rn > 1;
