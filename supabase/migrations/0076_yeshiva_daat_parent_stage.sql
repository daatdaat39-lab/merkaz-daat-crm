-- שלב-צד חדש למחלקת "ישיבת דעת" - "הורה" (parent_of_student) - כדי
-- שאפשר יהיה לשייך את הוריהם של תלמידי הישיבה (כרטיסים שכבר נוצרים
-- מתוך קשרי-המשפחה בזמן ייבוא, ר' resolveContactRelation ב-
-- leadIntakeCore.js) גם הם למחלקה עצמה, לא רק כקשר מהכרטיס של הילד.
-- is_side_stage=true (כמו role_holder הקיים) - לא נכנס לתהליך/פייפליין
-- הרגיל של לידים, רק תג-סיווג. sort_order=null - לא משנה, שלבי-צד
-- מוצאים תמיד מ-pipeline.order בלי קשר לערך (ר' getPipeline).
insert into pipeline_stages (workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage, lead_tab)
values (
  '5170480d-0af2-4eb3-9ff8-7b894ae7f1f7',
  'parent_of_student',
  'הורה',
  '#fff7ed',
  '#c2410c',
  null,
  false,
  false,
  true,
  'auto'
)
on conflict do nothing;
