-- מסך-רישום נפרד + שליחת-טפסים/חתימה דיגיטלית (תוכנית: "מסך-רישום נפרד").
-- (א) מצבי-ביניים "נשלח" לטפסים+חתימות (בנוסף ל"הושלם" הקיים), ושדה-קישור
-- לחתימה-דיגיטלית (signatures_link) - עד-כה היו-רק-שדות-הושלם/הערה.
alter table public.lead_conversion_checklist
  add column if not exists forms_sent_at timestamptz,
  add column if not exists signatures_link text,
  add column if not exists signatures_sent_at timestamptz;

-- (ב) קישור-ברירת-מחדל-לכל-קורס (לא-לכל-ליד) - הטופס-החיצוני-האמיתי
-- (daat-tevuna-.../register/...) הוא קישור-אחד-קבוע-לכל-הקורס (הוא-עצמו
-- שואל-את-הסטודנט-איזה-מסלול). מוגדר-פעם-אחת בהגדרות→קטלוג-קורסים,
-- משמש-כ-seed-חד-פעמי (לא-חי) לשדות-הצ'קליסט של-כל-ליד-חדש.
alter table public.courses
  add column if not exists registration_form_url text,
  add column if not exists signature_template_url text;
