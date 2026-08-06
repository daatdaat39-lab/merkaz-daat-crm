-- שליטת מנהל על נראות שדה - בשונה מ"הסתרה אישית" הקיימת (profiles.
-- hidden_extra_fields, כל אחד לעצמו), זה כלל ארגוני קשיח: שדה עם
-- visible_to_agents=false נעלם לגמרי מכל מי שאינו owner/admin של
-- המחלקה, בכל מסך (כרטיס איש קשר, עמוד לידים). ברירת מחדל true כדי
-- שכל השדות הקיימים ימשיכו להיות גלויים כרגיל בלי שינוי התנהגות.
alter table public.workspace_extra_fields
  add column if not exists visible_to_agents boolean not null default true;
