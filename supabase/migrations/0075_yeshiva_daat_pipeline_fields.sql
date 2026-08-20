-- שלבי pipeline ושדות מחלקתיים ל"ישיבת דעת" (0073), אותו דפוס בדיוק
-- כמו 0036 (pipeline_stages) ו-0043+0058 (workspace_extra_fields).
--
-- "בוגר" מסומן כשלב pipeline (is_won_stage) ולא כשדה/תגית נפרדת - נבחר
-- במפורש כדי לעשות שימוש חוזר במנגנון הקיים (StageStepper, פילה
-- צבעונית אוטומטית) בדיוק כמו ש"דעת ותבונה"/"דעת למדני" כבר עושים עם
-- שלב 'graduate' משלהם.
--
-- "מחזור" ו"תפקיד בישיבה" הם שני שדות נפרדים במכוון: "מחזור" (1-8)
-- רלוונטי רק למי שעבר מסלול לימודים אמיתי; "תפקיד בישיבה" (רב/שליח/
-- צוות/כולל/תלמיד) מחליף את מה שהיה בקובץ המקור "מחזור 9/10/11/20"
-- (קטגוריות-תפקיד שגויות בתוך שדה המחזור) - למי שאינו תלמיד לא ממלאים
-- מחזור בכלל, רק תפקיד. "שנות לימוד בישיבה" הוא ריבוי-ערכים
-- (allow_multiple) כי בקובץ המקור זו רשימת שנים (✓ לכל שנה), לא ערך יחיד.
insert into public.pipeline_stages (workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage)
select w.id, v.stage_key, v.label, v.color_bg, v.color_fg, v.sort_order, v.is_lead, v.is_won, v.is_side
from public.workspaces w, (values
  ('ישיבת דעת','active_student','תלמיד פעיל','#f0fdf4','#16a34a',0,false,false,false),
  ('ישיבת דעת','graduate','בוגר','#ecfdf5','#0d9488',1,false,true,false),
  ('ישיבת דעת','role_holder','צוות / רב / שליח','#f5f3ff','#7c3aed',null,false,false,true),
  ('ישיבת דעת','closed','סגור / לא רלוונטי','#fef2f2','#dc2626',null,false,false,true)
) as v(ws_name, stage_key, label, color_bg, color_fg, sort_order, is_lead, is_won, is_side)
where w.name = v.ws_name
  and not exists (select 1 from public.pipeline_stages p where p.workspace_id = w.id and p.stage_key = v.stage_key);

insert into public.workspace_extra_fields (workspace_id, field_key, label, type, options, sort_order, allow_multiple)
select w.id, v.field_key, v.label, v.type, v.options::jsonb, v.sort_order, v.allow_multiple
from public.workspaces w
cross join (values
  ('ישיבת דעת', 'cohort', 'מחזור', 'select', '["1","2","3","4","5","6","7","8"]', 0, false),
  ('ישיבת דעת', 'study_years', 'שנות לימוד בישיבה', 'select', '["תשע\"ז","תשע\"ח","תשע\"ט","תש\"פ","תשפ\"א","תשפ\"ב","תשפ\"ג","תשפ\"ד","תשפ\"ה","תשפ\"ו"]', 1, true),
  ('ישיבת דעת', 'yeshiva_role', 'תפקיד בישיבה', 'select', '["תלמיד","רב","שליח","צוות","כולל"]', 2, false)
) as v(workspace_name, field_key, label, type, options, sort_order, allow_multiple)
where w.name = v.workspace_name
  and not exists (
    select 1 from public.workspace_extra_fields e where e.workspace_id = w.id and e.field_key = v.field_key
  );
