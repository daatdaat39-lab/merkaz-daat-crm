-- ============================================================
-- Migration: אנשי קשר משותפים לכולם
-- כל משתמש מחובר יכול לראות ולערוך כל איש קשר, בכל מחלקה (workspace) שהיא.
-- לידים (contacts בשלב open/meeting, מוצג בעמוד /sales/leads) ממשיכים
-- להיות מסוננים בקוד לפי ה-workspace הנוכחי של המשתמש - זה לא משתנה כאן.
-- ============================================================

drop policy if exists "contacts_modify_workspace_member" on public.contacts;
drop policy if exists "contacts_select_workspace_member" on public.contacts;
drop policy if exists "contacts_select_policy" on public.contacts;

create policy "contacts_all_authenticated"
  on public.contacts for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );
