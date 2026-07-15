-- ============================================================
-- Migration: מפרידה בין תיבת מייל לקליטת לידים נכנסים (intake)
-- לבין תיבת מייל לשליחת מיילים יוצאים לאנשי קשר (send) - לכל
-- מחלקה יכולה להיות תיבה אחת לכל תפקיד (לא בהכרח אותה תיבה).
-- ============================================================

alter table public.email_connections
  add column if not exists purpose text not null default 'intake'
    check (purpose in ('intake', 'send'));

alter table public.email_connections
  add constraint email_connections_workspace_purpose_key unique (workspace_id, purpose);
