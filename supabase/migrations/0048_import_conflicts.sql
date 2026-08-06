-- תור קונפליקטים לייבוא - כשערך שמגיע מקובץ ייבוא מתנגש עם ערך קיים
-- אצל איש קשר (בכל שדה, לא רק טלפון/מייל), הוא כבר לא נזרק בשקט אלא
-- נשמר כאן לבדיקה ידנית - מיד אחרי הייבוא, או בכל זמן מאוחר יותר דרך
-- מסך "בדיקת כפיליות" בהגדרות. ר' leadIntakeCore.js (יצירה) ו-
-- app/dashboard/lib/importConflicts.js (קריאה/פתרון).
create table if not exists import_conflicts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  field_key text not null,          -- 'phone' | 'email' | 'idnum' | ... | 'extra:<key>'
  field_label text not null,
  existing_value text,
  new_value text,
  source_system text,
  batch_label text,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  resolution text check (resolution in ('kept_existing', 'used_new', 'kept_both')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create index if not exists import_conflicts_status_idx on import_conflicts (status);
create index if not exists import_conflicts_contact_idx on import_conflicts (contact_id);
create index if not exists import_conflicts_workspace_idx on import_conflicts (workspace_id);

alter table import_conflicts enable row level security;

-- אותו דפוס גורף כמו כל טבלה אחרת במערכת - ההרשאה האמיתית (רק
-- מנהל/בעלים של המחלקה) נאכפת בקוד (app/dashboard/lib/importConflicts.js
-- + resolveImportConflict ב-actions.js), לא ב-RLS.
create policy "authenticated users full access" on import_conflicts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
