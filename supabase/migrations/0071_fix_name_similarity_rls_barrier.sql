-- הסיבה האמיתית נמצאה (אושרה ישירות): שני EXPLAIN ANALYZE זהים באותה
-- שאילתה בדיוק - תחת role=authenticated (RLS פעילה) הפוסטגרס בוחר
-- Nested Loop + Index Scan על contacts_pkey (9.35 מיליון buffer hits -
-- כמעט הצולבה מלאה, ה-'%' רק מסנן בדיעבד); בלי RLS (כ-postgres/
-- superuser, אותה שאילתה בדיוק) הוא בוחר Bitmap Heap Scan על אינדקס
-- ה-GIN הטריגרם (276 אלף buffer hits - פי 34 פחות, מהיר).
--
-- הסיבה: RLS עוטפת סריקת טבלה כ"security barrier" - תנאי חיפוש
-- שמבוסס על פונקציה שלא מסומנת LEAKPROOF (similarity()/'%' מ-pg_trgm
-- אינם LEAKPROOF, במכוון - כדי שלא ידלפו מידע על שורות חסומות דרך
-- timing/שגיאות) לא נדחף מתחת למחסום-האבטחה, ולכן לא יכול לשמש כתנאי
-- לסריקת-אינדקס בלולאה מקוננת - postgres נופל בחזרה לאינדקס אחר (pkey)
-- ומסנן את הדמיון רק בדיעבד, על כל השורות.
--
-- הפתרון: SECURITY DEFINER - הפונקציה תרוץ בהרשאות הבעלים שלה (מי
-- שמריץ את המיגרציה הזו ב-SQL Editor - postgres, superuser שעוקף RLS
-- כברירת מחדל) ולא בהרשאות הקורא. זה מוריד את מחסום-האבטחה של RLS
-- לגמרי מהשאילתה הפנימית, ומאפשר לתכנון להשתמש באינדקס ה-GIN חופשי.
-- כדי לא לפתוח דלת גישה לא-מורשית (RLS על contacts היום היא רק
-- "auth.uid() is not null" - שקולה בפועל ל"חייב להיות מחובר", לא סינון
-- per-row אמיתי) - הפונקציה בודקת את זה במפורש בעצמה, ו-EXECUTE מוגבל
-- ל-authenticated בלבד (לא PUBLIC/anon).
create or replace function public.find_similar_contact_name_pairs(
  similarity_threshold float default 0.6,
  max_pairs int default 1000
)
returns table(id_a uuid, id_b uuid, sim float)
language sql
security definer
set search_path = public
stable
as $$
  select id_a, id_b, sim from (
    select a.id as id_a, b.id as id_b,
      similarity(
        lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, ''))),
        lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
      )::double precision as sim
    from contacts a
    join contacts b
      on lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, '')))
         % lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
    where a.id < b.id
  ) s
  where sim > similarity_threshold and (select auth.uid()) is not null
  order by sim desc
  limit max_pairs;
$$;

revoke all on function public.find_similar_contact_name_pairs(float, int) from public;
grant execute on function public.find_similar_contact_name_pairs(float, int) to authenticated;
