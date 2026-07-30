-- ============================================================
-- Migration: בקשות אישור בין נציגים - לשאול נציג אחר לגבי משימה או
-- פגישה ספציפית (למשל "מתאים לך גם השעה הזו?") לפני שסוגרים סופית.
-- הנמען יכול לאשר, או לסמן "צריך פרטים נוספים" עם הערה - והשולח יכול
-- לעדכן ולשלוח מחדש, בלולאה עד לאישור.
-- ============================================================

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  requested_by uuid not null,
  requested_to uuid not null,
  note text,
  status text not null default 'pending', -- pending | approved | needs_info
  response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists approval_requests_requested_to_idx on public.approval_requests(requested_to, status);
create index if not exists approval_requests_requested_by_idx on public.approval_requests(requested_by);

alter table public.approval_requests enable row level security;

drop policy if exists "approval_requests_all_authenticated" on public.approval_requests;
create policy "approval_requests_all_authenticated"
  on public.approval_requests for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
