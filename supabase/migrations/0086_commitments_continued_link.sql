-- מקשר הוראת-קבע חדשה (בעיקר מ"קשר") להוראת-קבע קודמת של אותו איש קשר
-- שהסתיימה סמוך לפני שהחדשה התחילה - "נעצר במקור אחד (למשל מערכת
-- עסקים), המשיך במקור אחר (קשר)" - כדי שבתצוגה יראו סיפור רציף אחד
-- במקום שתי שורות נפרדות ותלושות. self-reference, on delete set null
-- (לא cascade - מחיקת ההתחייבות הישנה לא אמורה למחוק את החדשה).
alter table public.commitments
  add column if not exists continued_from_commitment_id uuid references public.commitments(id) on delete set null;
create index if not exists commitments_continued_from_idx on public.commitments(continued_from_commitment_id);
