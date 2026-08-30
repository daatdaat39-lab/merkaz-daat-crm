-- הצעות-תיקון לאיש קשר: טלפן (או כל חבר) יכול "להציע" שינוי לשדה קיים,
-- אף פעם לא לכתוב ישירות ל-contacts. changes הוא jsonb {field: value},
-- תת-קבוצה של EDITABLE_FIELDS (contacts/actions.js) - נאכף בקוד השרת
-- בשתי הקצוות (הגשה ואישור), לא ב-DB. campaign_contact_id נלווה
-- (nullable) לצורך "מאיפה זה הגיע" - לא FK-חובה כי הצעת-תיקון יכולה
-- לבוא גם מכרטיס-קשר רגיל, לא רק מתוך שיחה.
create table public.contact_edit_suggestions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  campaign_contact_id uuid references public.campaign_contacts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index contact_edit_suggestions_contact_idx on public.contact_edit_suggestions(contact_id, status);
create index contact_edit_suggestions_status_idx on public.contact_edit_suggestions(status, created_at desc);

-- RLS פתוח - אותו דפוס בדיוק כמו campaign_call_attempts (0094): ההרשאה
-- האמיתית (מי יכול להגיש/לאשר) נאכפת בקוד השרת, לא כאן.
alter table public.contact_edit_suggestions enable row level security;
create policy "contact_edit_suggestions_all_authenticated"
  on public.contact_edit_suggestions for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
