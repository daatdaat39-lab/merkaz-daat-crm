-- שלב 5 (אחרון) ממודול מכירות/שירות: "הקפצת-מסך" CTI. אומת מול הקוד
-- בפועל: ה-webhook של 015 (hallo015-call/route.js) נשלח רק באירוע
-- Hangup (סיום שיחה) - אין לנו היום webhook על תחילת/מענה-שיחה, אז אין
-- אפשרות להקפצה אמיתית-באמצע-שיחה. זו בכוונה התראה **אחרי**-שיחה
-- ("קיבלת שיחה מ-X, לחץ לפתיחה") - סוכם מול המשתמש, לא טעות-תכנון.
--
-- קווים נפרדים אושרו ע"י המשתמש (לא קו אחד) - cti_line_routing ממפה
-- dnumber (המספר הפנימי שחויג אליו) למחלקה, כדי לדעת לאיזה workspace
-- לשייך את ההתראה.
create table if not exists public.cti_line_routing (
  id uuid primary key default gen_random_uuid(),
  dnumber text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);
alter table public.cti_line_routing enable row level security;
drop policy if exists "cti_line_routing_all_authenticated" on public.cti_line_routing;
create policy "cti_line_routing_all_authenticated" on public.cti_line_routing for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- "נוכחות" (מי פעיל עכשיו) - טבלת-heartbeat פשוטה (לא Presence API
-- אמיתי), עקבי עם שאר המערכת. בפועל, ברגע ש-cti_call_events משודרת
-- (postgres_changes), רק טאבים שבאמת פתוחים ומחוברים יקבלו אותה - אז
-- agent_presence היא בעיקר תשתית-עתידית/תצוגתית, לא השער היחיד.
create table if not exists public.agent_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  last_heartbeat_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
alter table public.agent_presence enable row level security;
drop policy if exists "agent_presence_all_authenticated" on public.agent_presence;
create policy "agent_presence_all_authenticated" on public.agent_presence for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- האירוע עצמו - שורה אחת לכל שיחה-נכנסת-שהסתיימה שנוצרה התאמת-מחלקה
-- (ר' lib/cti). agent_id = התראה אישית (יש נציג-מטפל ידוע); null =
-- שידור-למחלקה (כל מי שפתוח על ה-workspace הזה כרגע). לקוחות מאזינים
-- ב-postgres_changes (ר' NewLeadToast/PendingAutomationWatcher לדפוס).
create table if not exists public.cti_call_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  department_id uuid references public.contact_departments(id) on delete set null,
  agent_id uuid references auth.users(id),
  phone text,
  answered boolean,
  created_at timestamptz not null default now()
);
create index if not exists cti_call_events_workspace_idx on public.cti_call_events(workspace_id, created_at desc);
alter table public.cti_call_events enable row level security;
drop policy if exists "cti_call_events_all_authenticated" on public.cti_call_events;
create policy "cti_call_events_all_authenticated" on public.cti_call_events for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
