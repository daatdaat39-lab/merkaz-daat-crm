-- ============================================================
-- Migration: תמונת פרופיל לאיש קשר (bucket ציבורי ב-Storage) + קישור
-- לאיש קשר קרוב (למשל קרבה משפחתית) שמוביל לכרטיס אחר.
-- ============================================================

alter table public.contacts add column if not exists photo_url text;
alter table public.contacts add column if not exists related_contact_id uuid references public.contacts(id) on delete set null;
alter table public.contacts add column if not exists relation_label text;

insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do nothing;
