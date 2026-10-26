-- הערכת-AI נפרדת לסבירות-לסגור (migration 0162 הוסיפה את ההערכה-הידנית
-- של הנציג, rep_confidence - זה לא ממוזג איתה, ר' דיון "ציון-סבירות-
-- לסגור"). נכתבת באותה-קריאה בדיוק כמו ai_action_summary (suggestActionChip.js
-- המורחב) - לא קריאת-AI נפרדת, ואותו דגל-staleness הקיים (ai_action_summary_stale).
alter table public.contact_departments
  add column if not exists ai_confidence text check (ai_confidence in ('hot', 'warm', 'cold')),
  add column if not exists ai_confidence_updated_at timestamptz;
