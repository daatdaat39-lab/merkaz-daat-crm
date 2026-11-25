-- טיפול בוואטסאפים נכנסים: שיחה אחת לכל מספר טלפון (עם בעלים, סטטוס וזמן
-- המתנה), רשת ביטחון להודעות שנמשכו מ-InforU, "נקרא" אישי לכל נציג,
-- ובדיקת דופק לחיבור. אדיטיבי בלבד - אפשר להריץ שוב בלי נזק.

-- 1. sent_whatsapp: מזהה הודעה חיצוני (מניעת כפילויות), טלפון מנורמל
--    (9 ספרות אחרונות, כמו contacts.phone_digits ב-0065), קישור לשיחה, מדיה.
alter table public.sent_whatsapp
  add column if not exists external_message_id text,
  add column if not exists phone_digits text generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)) stored,
  add column if not exists conversation_id uuid,
  add column if not exists media_uid text,
  add column if not exists media_path text;

create unique index if not exists sent_whatsapp_external_message_idx
  on public.sent_whatsapp (external_message_id) where external_message_id is not null;
create index if not exists sent_whatsapp_phone_digits_idx
  on public.sent_whatsapp (phone_digits, sent_at desc);
create index if not exists sent_whatsapp_conversation_idx
  on public.sent_whatsapp (conversation_id, sent_at desc) where conversation_id is not null;

-- 2. השיחות. status: waiting_us = הלקוח כתב וממתין לנו, waiting_customer =
--    ענינו, done = סומן "טופל" בלי מענה (closed_by/closed_at).
create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_digits text not null unique,
  phone text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  contact_department_id uuid references public.contact_departments(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'waiting_us' check (status in ('waiting_us', 'waiting_customer', 'done')),
  waiting_since timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_direction text check (last_direction in ('in', 'out')),
  first_response_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_conversations_status_idx on public.whatsapp_conversations (status, waiting_since);
create index if not exists whatsapp_conversations_last_idx on public.whatsapp_conversations (last_message_at desc);
create index if not exists whatsapp_conversations_contact_idx on public.whatsapp_conversations (contact_id) where contact_id is not null;

alter table public.whatsapp_conversations enable row level security;
drop policy if exists "whatsapp_conversations_all_authenticated" on public.whatsapp_conversations;
create policy "whatsapp_conversations_all_authenticated" on public.whatsapp_conversations for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

do $$ begin
  alter table public.sent_whatsapp
    add constraint sent_whatsapp_conversation_id_fkey
    foreign key (conversation_id) references public.whatsapp_conversations(id) on delete set null;
exception when duplicate_object then null; end $$;

-- 3. "נקרא" אישי - מתי כל נציג פתח כל שיחה בפעם האחרונה.
create table if not exists public.whatsapp_conversation_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.whatsapp_conversation_reads enable row level security;
drop policy if exists "whatsapp_conversation_reads_own" on public.whatsapp_conversation_reads;
create policy "whatsapp_conversation_reads_own" on public.whatsapp_conversation_reads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. רשת ביטחון: כל הודעה שנמשכה מ-InforU נשמרת קודם כאן כמו שהיא
--    (המשיכה מוחקת אותה מהתור שלהם), ורק אז מעובדת. בלי policy בכוונה -
--    רק קוד השרת (service role) ניגש.
create table if not exists public.whatsapp_inbound_raw (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  error text
);
create index if not exists whatsapp_inbound_raw_pending_idx
  on public.whatsapp_inbound_raw (received_at) where processed_at is null;
alter table public.whatsapp_inbound_raw enable row level security;

-- 5. בדיקת דופק לחיבורים (משיכת וואטסאפ וכו') - קריאה לכל משתמש מחובר,
--    כתיבה רק מקוד השרת.
create table if not exists public.integration_health (
  key text primary key,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.integration_health enable row level security;
drop policy if exists "integration_health_read_authenticated" on public.integration_health;
create policy "integration_health_read_authenticated" on public.integration_health for select
  using (auth.uid() is not null);

-- 6. מילוי ראשוני: שיחה לכל מספר שכבר יש לו הודעות. מי שההודעה האחרונה
--    שלו נכנסת ממתין לנו (מהרגע שכתב אחרי המענה האחרון שלנו).
with msgs as (
  select * from public.sent_whatsapp where length(phone_digits) >= 7
),
last_msg as (
  select distinct on (phone_digits) phone_digits, phone, sent_at, direction,
    left(coalesce(message, reason, ''), 200) as preview
  from msgs order by phone_digits, sent_at desc
),
agg as (
  select phone_digits,
    max(sent_at) filter (where direction = 'in') as last_in,
    max(sent_at) filter (where direction = 'out') as last_out
  from msgs group by phone_digits
),
linked as (
  select distinct on (phone_digits) phone_digits, contact_id, workspace_id, contact_department_id
  from msgs where contact_id is not null
  order by phone_digits, (contact_department_id is not null) desc, (workspace_id is not null) desc, sent_at desc
)
insert into public.whatsapp_conversations
  (phone_digits, phone, contact_id, workspace_id, contact_department_id, assigned_to, status, waiting_since,
   last_inbound_at, last_outbound_at, last_message_at, last_message_preview, last_direction)
select l.phone_digits, l.phone, k.contact_id, k.workspace_id, k.contact_department_id, cd.agent_id,
  case when l.direction = 'in' then 'waiting_us' else 'waiting_customer' end,
  case when l.direction = 'in' then (
    select min(m.sent_at) from msgs m
    where m.phone_digits = l.phone_digits and m.direction = 'in' and (a.last_out is null or m.sent_at > a.last_out)
  ) end,
  a.last_in, a.last_out, l.sent_at, l.preview, l.direction
from last_msg l
join agg a using (phone_digits)
left join linked k using (phone_digits)
left join public.contact_departments cd on cd.id = k.contact_department_id
on conflict (phone_digits) do nothing;

update public.sent_whatsapp s
set conversation_id = c.id
from public.whatsapp_conversations c
where s.conversation_id is null and s.phone_digits = c.phone_digits;

-- 7. רענון חי של רשימת השיחות (כמו sent_whatsapp ב-0172).
do $$ begin
  alter publication supabase_realtime add table public.whatsapp_conversations;
exception when duplicate_object then null; end $$;
