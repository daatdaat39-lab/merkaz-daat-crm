alter table public.email_connections drop constraint if exists email_connections_purpose_check;
alter table public.email_connections add constraint email_connections_purpose_check
  check (purpose in ('intake', 'send', 'call_recordings'));

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', true)
on conflict (id) do nothing;
