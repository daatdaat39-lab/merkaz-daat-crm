-- ============================================================
-- Migration: מפעיל Realtime על contact_departments - כדי שהודעת
-- "נכנס ליד חדש" תקפוץ בזמן אמת בכל האתר כשמתווסף שיוך מחלקה חדש.
-- ============================================================

alter publication supabase_realtime add table public.contact_departments;
