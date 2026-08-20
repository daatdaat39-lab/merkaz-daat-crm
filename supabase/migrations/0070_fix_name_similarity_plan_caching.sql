-- תיקון שלישי ל-find_similar_contact_name_pairs (אחרי 0068/0069): נבדק
-- בפועל שדרך service_role (קריאה בודדת) הפונקציה מהירה (~1 שנייה), אבל
-- מהאפליקציה עצמה (משתמש מחובר, authenticated) היא עדיין נכשלת ב-
-- statement timeout (57014) - אומת ישירות דרך באנר שגיאה שהוצג בעמוד.
--
-- הסיבה הסבירה: זו פונקציית plpgsql שקוראת ל-set_limit(similarity_
-- threshold) בזמן ריצה כדי לקבוע את סף אופרטור ה-'%' - אבל plpgsql
-- שומר תוכניות-ביצוע (plan cache) פר-קונקשן, ואחרי כמה קריאות עובר
-- מ"תוכנית מותאמת" (custom plan, שמכירה את הערך שהועבר בפועל) ל"תוכנית
-- גנרית" (generic plan, לא תלוית-פרמטר) - וכיוון שה-GUC נקבע בזמן ריצה
-- (לא ידוע בזמן התכנון של תוכנית גנרית), postgres יכול לבחור בחזרה
-- בתוכנית הסריקה-המלאה האיטית. זה תלוי כמה בקשות רצו על אותו backend
-- מאוחורי ה-pooler - ולכן "לפעמים עובד, לפעמים לא", בדיוק מה שנצפה.
--
-- הפתרון: לחזור לפונקציית 'language sql' פשוטה (בלי plpgsql/set_limit
-- בכלל) - אופרטור ה-'%' משתמש בסף ברירת המחדל הקבוע של pg_trgm (0.3,
-- לא תלוי בפרמטר של הפונקציה) בתור מסנן-מועמדים מהיר דרך האינדקס, ורק
-- אז מסננים במדויק לפי similarity_threshold שהתקבל כפרמטר. כך תוכנית
-- הביצוע של ה-'%' לא תלויה בשום בind-parameter של הפונקציה שלנו בכלל -
-- אין הבדל בין תוכנית גנרית למותאמת, אין תלות ב"כמה קריאות כבר רצו".
-- מספיק כל עוד similarity_threshold שמועבר בפועל >= 0.3 (ברירת המחדל
-- בקוד היא 0.6 - page.js לא מעביר פרמטר בכלל).
create or replace function public.find_similar_contact_name_pairs(
  similarity_threshold float default 0.6,
  max_pairs int default 1000
)
returns table(id_a uuid, id_b uuid, sim float)
language sql
stable
as $$
  select id_a, id_b, sim from (
    select a.id as id_a, b.id as id_b,
      similarity(
        lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, ''))),
        lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
      )::double precision as sim
    from contacts a
    join contacts b on a.id < b.id
      and lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, '')))
          % lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
  ) s
  where sim > similarity_threshold
  order by sim desc
  limit max_pairs;
$$;
