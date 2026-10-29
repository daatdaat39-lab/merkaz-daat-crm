-- באג שהתגלה בבדיקה-חיה (שיחת-בדיקה אמיתית, ר' שדרוג-ה-webhook ל-
-- אירוע "Calling"): שורת cti_call_events נוצרת נכון ב-DB ברגע-הצלצול
-- (אומת - נוצרה 2 שניות אחרי תחילת-השיחה), אבל הטוסט (CtiCallToast.js)
-- לא קפץ בדפדפן בכלל. הסיבה: migration 0153 (שיצרה את הטבלה) שכחה את
-- השורה שמפעילה Realtime (ALTER PUBLICATION) - בניגוד לכל שאר הטבלאות
-- שמוזרמות-חי באותו דפוס (ר' migration 0013 ל-contact_departments,
-- 0056 ל-pending_automations) - כלומר פיצ'ר "הקפצת-המסך" כנראה מעולם
-- לא עבד בפועל, גם לא בגרסה הישנה (Hangup-בלבד).
alter publication supabase_realtime add table public.cti_call_events;
