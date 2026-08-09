-- מספר ילדים - הועבר משדה מחלקתי (workspace_extra_fields, רק במחלקת
-- תרומות) לעמודת בסיס משותפת ב-contacts, כי זה פרט אישי כללי ולא
-- ספציפי למחלקה אחת.
alter table public.contacts
  add column if not exists children_count int;
