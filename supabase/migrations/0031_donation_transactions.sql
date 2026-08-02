-- ============================================================
-- Migration: היסטוריית תרומות ברמת תנועה בודדת (לא רק תמונת מצב
-- נוכחית) - כל תשלום/תרומה בשורה נפרדת, מקושר לכרטיס. מיועד לייבוא
-- מכמה מקורות היסטוריים (מערכות הנהלת חשבונות שונות) ובעתיד מחיבור
-- חי למערכת "קשר" - ר' bulkImportContactRows ב-leadIntakeCore.js.
-- external_doc_number הוא מספר המסמך/תנועה מהמערכת המקורית - אינדקס
-- ייחודי עליו מונע ייבוא כפול של אותה תנועה בדיוק משני קבצים/ריצות
-- ייבוא שונות. אינדקס ייחודי רגיל (לא חלקי בכוונה) - לפי סמנטיקת SQL
-- סטנדרטית NULL לעולם לא נחשב שווה ל-NULL אחר, כך ששורות בלי מספר
-- מסמך כלל לא נחסמות, וגם ON CONFLICT (external_doc_number) הרגיל של
-- supabase-js.upsert() תואם אינדקס כזה בלי צורך בתנאי WHERE נוסף
-- (בניגוד לאינדקס חלקי, שדורש חזרה מפורשת על התנאי ב-ON CONFLICT).
-- ============================================================

create table if not exists public.donation_transactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_system text,
  external_doc_number text,
  amount numeric not null,
  transaction_date date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists donation_transactions_doc_number_idx
  on public.donation_transactions(external_doc_number);

create index if not exists donation_transactions_contact_idx
  on public.donation_transactions(contact_id);

alter table public.donation_transactions enable row level security;

drop policy if exists "donation_transactions_all_authenticated" on public.donation_transactions;
create policy "donation_transactions_all_authenticated"
  on public.donation_transactions for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
