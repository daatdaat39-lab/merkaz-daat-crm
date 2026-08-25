-- מוסיף תיוג ידני/אוטומטי לכל ריצת סנכרון (ר' 0087), והגדרה אחת (שורה
-- יחידה - "singleton row", id boolean עם check(id) מבטיח שלעולם לא תהיה
-- יותר משורה אחת) שהמנהל שולט בה מתוך המערכת: כל כמה זמן הסנכרון
-- האוטומטי (cron) רץ בפועל, ואם הוא מופעל בכלל. ברירת מחדל: פעם ביום,
-- כבוי עד שהמנהל יפעיל.
alter table public.kesher_sync_runs
  add column if not exists triggered_by text not null default 'manual';

create table if not exists public.kesher_sync_settings (
  id boolean primary key default true,
  interval_minutes int not null default 1440,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint kesher_sync_settings_singleton check (id)
);
insert into public.kesher_sync_settings (id) values (true) on conflict (id) do nothing;
alter table public.kesher_sync_settings enable row level security;
create policy "kesher_sync_settings_all_authenticated" on public.kesher_sync_settings for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
