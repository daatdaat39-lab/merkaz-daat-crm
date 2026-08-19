-- מפעיל את תוסף pg_trgm (המשתמש כבר הפעיל ידנית - idempotent, כאן רק
-- כדי שזה יהיה חלק ממערכת המיגרציות הרשמית ולא רק שינוי אד-הוק).
-- אינדקס GIN על שם מלא מנורמל - כדי שחיפוש-דמיון (similarity()) לא ירוץ
-- O(n²) סריקה מלאה בכל פעם, אלא ישתמש באינדקס.
create extension if not exists pg_trgm;

create index if not exists contacts_full_name_trgm_idx
  on public.contacts using gin (
    (lower(trim(coalesce(first, '') || ' ' || coalesce(last, '')))) gin_trgm_ops
  );

-- פונקציה (RPC) - הראשונה בפרויקט שנקראת בפועל מקוד האפליקציה
-- (supabase.rpc(...)) ולא רק כעזר בתוך RLS policies (כמו is_workspace_member,
-- מיגרציה 0002). חריגה מכוונת וממוקדת: חיפוש-דמיון-טקסט בקנה מידה (2,840+
-- אנשי קשר וגדל) הוא בדיוק התפקיד שאינדקס GIN טריגרם נבנה בשבילו - אי
-- אפשר לשכפל את זה ביעילות בצד האפליקציה בלי O(n²). security invoker
-- (ברירת מחדל) מספיק - לא צריך לעקוף RLS, contacts כבר פתוחה לכל
-- authenticated לפי ה-RLS הקיים.
create or replace function public.find_similar_contact_name_pairs(
  similarity_threshold float default 0.6,
  max_pairs int default 1000
)
returns table(id_a uuid, id_b uuid, sim float)
language sql
stable
as $$
  select a.id, b.id,
    similarity(
      lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, ''))),
      lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
    ) as sim
  from contacts a
  join contacts b on a.id < b.id
    and similarity(
      lower(trim(coalesce(a.first, '') || ' ' || coalesce(a.last, ''))),
      lower(trim(coalesce(b.first, '') || ' ' || coalesce(b.last, '')))
    ) > similarity_threshold
  order by sim desc
  limit max_pairs;
$$;
