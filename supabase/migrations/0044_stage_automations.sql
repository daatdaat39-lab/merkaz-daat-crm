-- אוטומציה אוטומטית לפי שלב pipeline - שליחת תבנית וואטסאפ/מייל, או
-- יצירת משימת פולו-אפ, ברגע שאיש קשר עובר לשלב מסוים במחלקה. מוגדר
-- דרך מסך שלבי ה-pipeline הקיים (settings/pipelines), לא מסך נפרד.
create table if not exists public.stage_automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage_key text not null,
  action_type text not null, -- 'send_whatsapp_template' | 'send_email_template' | 'create_task'
  whatsapp_template_id uuid references public.whatsapp_templates(id) on delete set null,
  email_template_id uuid references public.email_templates(id) on delete set null,
  task_title text,
  task_due_offset_days int default 1,
  created_at timestamptz not null default now()
);
create index if not exists stage_automations_workspace_stage_idx on public.stage_automations(workspace_id, stage_key);
alter table public.stage_automations enable row level security;
create policy "stage_automations_all_authenticated" on public.stage_automations for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
