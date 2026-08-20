-- תיקון קטן ל-0068: similarity() מחזירה real (float4), אבל חתימת
-- הפונקציה מצהירה sim כ-float (= double precision/float8) - אימות בפועל
-- (קריאה ל-RPC אחרי הרצת 0068) החזיר שגיאה: "Returned type real does
-- not match expected type double precision in column 3". תוספת cast
-- מפורש בלבד, שאר הפונקציה (האופרטור % + set_limit) נשארת זהה.
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
      )::double precision as sim
    from contacts a
    join contacts b on a.id < b.id
      and lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, '')))
          % lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
    order by sim desc
    limit max_pairs;
end;
$$;
