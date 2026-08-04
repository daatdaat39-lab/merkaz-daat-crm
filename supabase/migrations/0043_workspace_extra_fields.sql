-- הופך את EXTRA_FIELDS (עד כה אובייקט JS קבוע ב-components/pipelines.js)
-- ל-DB-backed, כדי שמנהל יוכל להוסיף/לערוך/למחוק שדה מחלקתי דרך מסך
-- הגדרות במקום לערוך קוד ולפרוס מחדש. אותו דפוס בדיוק כמו pipeline_stages
-- (מיגרציה 0036) ו-campaign_stages (0039).
create table if not exists public.workspace_extra_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  field_key text not null,
  label text not null,
  type text not null default 'text', -- text | select | number | date
  options jsonb not null default '[]'::jsonb, -- ל-type='select' בלבד
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, field_key)
);
create index if not exists workspace_extra_fields_workspace_idx on public.workspace_extra_fields(workspace_id, sort_order);
alter table public.workspace_extra_fields enable row level security;
create policy "workspace_extra_fields_all_authenticated" on public.workspace_extra_fields for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- זריעת הערכים הקיימים היום (EXTRA_FIELDS הקבוע ב-components/pipelines.js)
-- כך שהמעבר ל-DB-backed לא משנה שום דבר בפועל ביום המעבר.
insert into public.workspace_extra_fields (workspace_id, field_key, label, type, options, sort_order)
select w.id, v.field_key, v.label, v.type, v.options::jsonb, v.sort_order
from public.workspaces w
cross join (values
  ('דעת למדני', 'study_track', 'מסלול לימודים מבוקש', 'text', '[]', 0),
  ('דעת למדני', 'initial_payment_stage', 'שלב תשלום ראשוני', 'select', '["טרם שולם","מקדמה שולמה","שולם במלואו"]', 1),
  ('דעת ותבונה', 'study_track', 'מסלול לימודים מבוקש', 'text', '[]', 0),
  ('דעת ותבונה', 'initial_payment_stage', 'שלב תשלום ראשוני', 'select', '["טרם שולם","מקדמה שולמה","שולם במלואו"]', 1),
  ('דעת ותבונה', 'current_course', 'קורס נוכחי', 'text', '[]', 2),
  ('דעת ותבונה', 'graduate_of', 'בוגר הקורסים', 'text', '[]', 3),
  ('דעת ותבונה', 'graduation_year', 'שנת סיום', 'number', '[]', 4),
  ('דעת ותבונה', 'short_course_purchased', 'רכש קורס קצר לצפייה עצמית', 'select', '["כן","לא"]', 5),
  ('תרומות', 'expected_donation_amount', 'סכום תרומה', 'number', '[]', 0),
  ('תרומות', 'donation_type', 'סוג תרומה', 'select', '["חד פעמי","הוראת קבע"]', 1),
  ('תרומות', 'donation_date', 'תאריך התרומה', 'date', '[]', 2),
  ('תרומות', 'standing_order_start_date', 'תאריך התחלה', 'date', '[]', 3),
  ('תרומות', 'standing_order_next_charge_date', 'תאריך חיוב הבא', 'date', '[]', 4),
  ('תרומות', 'standing_order_total_payments', 'סה"כ תשלומים בהוראה', 'number', '[]', 5),
  ('תרומות', 'donor_type', 'תורם חוזר או חדש', 'select', '["חדש","חוזר"]', 6),
  ('תרומות', 'pledge_fulfillment_date', 'תאריך מימוש הבטחת תרומה', 'date', '[]', 7),
  ('תרומות', 'donation_paused', 'תרומה מוקפאת זמנית', 'select', '["כן","לא"]', 8),
  ('תרומות', 'paused_until', 'הקפאה עד תאריך', 'date', '[]', 9)
) as v(workspace_name, field_key, label, type, options, sort_order)
where w.name = v.workspace_name
  and not exists (
    select 1 from public.workspace_extra_fields e where e.workspace_id = w.id and e.field_key = v.field_key
  );
