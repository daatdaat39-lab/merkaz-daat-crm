-- שיוך מפורש של שלב pipeline ל"טאב" ברשימת הלידים (פתוחים/בתהליך/
-- הצליחו/נפלו), במקום ההיוריסטיקה האוטומטית היחידה שהייתה קיימת
-- (leadStages+wonStage+שיוך נציג). 'auto' = ברירת המחדל, ממשיך להשתמש
-- בהיוריסטיקה הקיימת בדיוק כמו היום; שאר הערכים עוקפים אותה לגמרי
-- לשלב הזה. ר' app/dashboard/sales/leads/LeadsBoard.js (tabOf).
alter table public.pipeline_stages
  add column if not exists lead_tab text not null default 'auto'
  check (lead_tab in ('auto', 'new', 'in_progress', 'won', 'closed'));
