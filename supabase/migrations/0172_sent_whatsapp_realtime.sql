-- הקפצת-התראה-חיה לנציג-המטפל כש-מתקבלת הודעת-WhatsApp נכנסת (בדיוק
-- כמו CtiCallToast לשיחות-נכנסות) - אותו-באג-בדיוק-שכבר-תוקן ב-0165
-- (cti_call_events לא-היה-מחובר-ל-Realtime): sent_whatsapp גם היא
-- אף-פעם-לא-חוברה-לפרסום-ה-Realtime, למרות שה-webhook (inforu-whatsapp)
-- כבר-כותב-אליה הודעות-נכנסות (direction='in') כבר-זמן-רב - ההתראה
-- פשוט-לא-הייתה-יכולה-לעבוד-בלי-זה, בלי-קשר-לקומפוננטה-שטרם-נבנתה.
alter publication supabase_realtime add table public.sent_whatsapp;
