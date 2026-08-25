-- שלב "מיפוי אנושי" בקמפיין - צוות/מתנדבים עוברים על רשימת אנשי-הקשר
-- שכבר בקמפיין ומסמנים ידע-יחסים שהמערכת לא יכולה לדעת לבד (מכיר/לא
-- רלוונטי, קבוצת-אב, הערות, הצפי). שום שדה כאן לא חובה - הרעיון המרכזי
-- שסוכם: מיפוי-ראשוני מהיר, אפשר לדלג על הכל ולחזור בסבב הבא.
alter table public.campaign_contacts
  add column if not exists mapping_decision text,
  add column if not exists mapping_parent_group text,
  add column if not exists mapping_note_owner text,
  add column if not exists mapping_note_rep text,
  add column if not exists mapping_expectation_bucket text,
  add column if not exists mapping_expectation_note text,
  add column if not exists mapped_by uuid references auth.users(id) on delete set null,
  add column if not exists mapped_at timestamptz,
  -- "טיפול משותף" לזוג מקושר (related_contact_id) - לקמפיין הזה בלבד,
  -- לא נוגע בכרטיסים הקבועים שלהם. מצביע על שורת campaign_contacts השנייה
  -- (לא על contact_id) כי זה ספציפי-לקמפיין - אותו זוג יכול "לטפל יחד"
  -- בקמפיין אחד ולא באחר.
  add column if not exists joint_handling_with uuid references public.campaign_contacts(id) on delete set null,
  add column if not exists joint_handling_note text;

-- רשימת-בחירה מורחבת ("החלטת מיפוי") - אותו דפוס בדיוק כמו campaign_category
-- הקיימת (מיגרציה 0034/0043) - נערכת דרך הגדרות ← רשימות בחירה, לא קוד.
insert into public.picklists (list_key, workspace_id, value, sort_order)
select 'mapping_decision', w.id, v.value, v.sort_order
from public.workspaces w
cross join (values ('רלוונטי', 0), ('לא רלוונטי', 1), ('מישהו אחר צריך לגשת', 2)) as v(value, sort_order)
where w.name = 'תרומות'
  and not exists (
    select 1 from public.picklists p where p.list_key = 'mapping_decision' and p.workspace_id = w.id and p.value = v.value
  );
