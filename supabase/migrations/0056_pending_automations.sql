-- אוטומציות שלב הופכות מביצוע מיידי לתור אישור ידני - הנציג המשויך
-- (agent_id, מצולם בזמן היצירה מ-contact_departments.agent_id) חייב
-- לאשר לפני שנשלחת הודעה/נוצרת משימה. פרטי איש הקשר (first/last/phone/
-- email) מצולמים בזמן היצירה ולא נשלפים מחדש באישור, כדי שהאישור יפעל
-- בדיוק על מה שהיה נכון כשהאוטומציה הופעלה, גם אם משהו השתנה בינתיים.
create table if not exists public.pending_automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  contact_department_id uuid references public.contact_departments(id) on delete cascade,
  agent_id uuid references auth.users(id),
  stage_key text not null,
  stage_label text,
  action_type text not null check (action_type in ('send_whatsapp_template', 'send_email_template', 'create_task')),
  whatsapp_template_id uuid references public.whatsapp_templates(id) on delete set null,
  email_template_id uuid references public.email_templates(id) on delete set null,
  task_title text,
  task_due_offset_days int,
  contact_first text,
  contact_last text,
  contact_phone text,
  contact_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
create index if not exists pending_automations_agent_idx on public.pending_automations(agent_id, status);
create index if not exists pending_automations_workspace_idx on public.pending_automations(workspace_id);

alter table public.pending_automations enable row level security;
create policy "pending_automations_all_authenticated" on public.pending_automations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- מפעיל Realtime - כדי שההודעה הצפה תקפוץ מיד לנציג המשויך, אותו דפוס
-- בדיוק כמו migration 0013 עבור "נכנס ליד חדש".
alter publication supabase_realtime add table public.pending_automations;
