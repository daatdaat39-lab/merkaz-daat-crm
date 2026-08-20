-- תיקון: find_similar_contact_name_pairs (מיגרציה 0066) הגדירה אינדקס
-- GIN טריגרם, אבל השאילתה השתמשה ב-similarity(a,b) > threshold ישירות
-- ב-WHERE - האינדקס מאיץ רק את אופרטור '%' (או '<->'), לא קריאת פונקציה
-- ישירה. בפועל זה אומר שהשאילתה רצה O(n²) מלא (סריקה מלאה, לא אינדקס)
-- - עם 4,330+ אנשי קשר זה כ-9.4 מיליון זוגות וגורם ל-statement timeout
-- אמיתי. מאומת ישירות: קריאה ל-RPC נכשלה עם "canceling statement due to
-- statement timeout". וה-caller (page.js) לא בדק שגיאה, אז זה נכשל בשקט
-- והחזיר תמיד 0 תוצאות - שכבת "שם דומה" בתור הכפילויות לא עבדה בפועל.
--
-- הפתרון: שימוש באופרטור '%' (מופעל ע"י פונקציית set_limit() שקובעת את
-- pg_trgm.similarity_threshold לריצה הזו) - זה כן נתפס ע"י אינדקס ה-GIN
-- (nested-loop index scan: לכל שורה ב-a, בדיקת דמיון מול b דרך האינדקס),
-- ואז מסננים שוב במדויק לפי similarity_threshold שהתקבל כפרמטר.
create or replace function public.find_similar_contact_name_pairs(
  similarity_threshold float default 0.6,
  max_pairs int default 1000
)
returns table(id_a uuid, id_b uuid, sim float)
language plpgsql
stable
as $$
begin
  perform set_limit(similarity_threshold::real);
  return query
    select a.id, b.id,
      similarity(
        lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, ''))),
        lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
      ) as sim
    from contacts a
    join contacts b on a.id < b.id
      and lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, '')))
          % lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
    order by sim desc
    limit max_pairs;
end;
$$;
