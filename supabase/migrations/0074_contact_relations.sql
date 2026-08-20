-- טבלת קשרים בין אנשי-קשר (הורה/ילד וכו') - one-to-many אמיתי, אותו
-- דפוס בדיוק כמו contact_phones (0062) / contact_course_enrollments
-- (0072). לא נוגע ב-contacts.related_contact_id/relation_label הקיים
-- (0023) - זה נשאר כמו שהוא לזוגות (splitCoupleContact ב-actions.js,
-- קישור דו-כיווני יחיד). כאן, לעומת זאת, אפשר כמה שורות לאותו contact_id
-- (למשל תלמיד עם גם אב וגם אם) - בלי הגבלת "קשר אחד לאדם" שיש בעמודה
-- הישנה. relation_label מתאר מה related_contact_id הוא ל-contact_id
-- (למשל contact_id=תלמיד, related_contact_id=כרטיס האב, label='אב').
create table if not exists public.contact_relations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  related_contact_id uuid not null references public.contacts(id) on delete cascade,
  relation_label text not null,
  created_at timestamptz not null default now(),
  unique (contact_id, related_contact_id, relation_label)
);
create index if not exists contact_relations_contact_idx on public.contact_relations(contact_id);
create index if not exists contact_relations_related_idx on public.contact_relations(related_contact_id);
alter table public.contact_relations enable row level security;
create policy "contact_relations_all_authenticated" on public.contact_relations for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
