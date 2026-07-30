-- ============================================================
-- Migration: קישור Zoom אוטומטי לפגישות מסוג "זום" - נוצר בפועל רק אם
-- מוגדרים משתני הסביבה ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
-- (ר' lib/zoom/client.js) - עד אז השדה פשוט נשאר ריק.
-- ============================================================

alter table public.meetings
  add column if not exists zoom_join_url text;
