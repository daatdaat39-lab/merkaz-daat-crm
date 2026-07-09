-- ============================================================
-- Migration: Pipeline נפרד לכל מחלקה (לפי אפיון CRM)
-- ============================================================

-- שדה סיבת סגירה (לליד שנסגר בלי להירשם/לתרום)
alter table public.contacts add column if not exists closed_reason text;

-- מיפוי הערכים הישנים (open/meeting/process/registered/closed) לערכים החדשים,
-- לפי ה-pipeline המתאים למחלקה של כל איש קשר
update public.contacts c
set stage = case
  when w.name in ('דעת למדני', 'דעת ותבונה', 'מרכז דעת — ראשי') then
    case c.stage
      when 'open' then 'open'
      when 'meeting' then 'meeting'
      when 'process' then 'registering'
      when 'registered' then 'registered'
      when 'closed' then 'closed'
      else c.stage
    end
  when w.name = 'תרומות' then
    case c.stage
      when 'open' then 'potential'
      when 'meeting' then 'contacted'
      when 'process' then 'offer'
      when 'registered' then 'donated'
      when 'closed' then 'closed'
      else c.stage
    end
  else c.stage
end
from public.workspaces w
where c.workspace_id = w.id;

-- מחליפים את מגבלת הערכים הישנה (5 ערכים כלליים) בחדשה (כל הערכים מכל ה-pipelines)
alter table public.contacts drop constraint if exists contacts_stage_check;

alter table public.contacts
  add constraint contacts_stage_check check (stage in (
    'new_lead', 'open', 'meeting', 'registering', 'registered', 'started', 'active_student', 'graduate',
    'potential', 'no_contact_yet', 'contacted', 'call', 'offer', 'committed', 'donated', 'active_donor',
    'closed'
  ));
