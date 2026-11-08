-- מסך-וואטסאפ "ממתינים לתגובה" + פעמון-ההודעות (Topbar) - כרגע סופרים
-- כל-שיחה-שהודעתה-האחרונה-הגיעה-מהלקוח, בלי-הבדל-אם-נצפתה-כבר. מוסיפים
-- read_at (אותו-דפוס-בדיוק כמו contact_shares.read_at, app/dashboard/
-- layout.js:125-130) - פתיחת-מסך-הוואטסאפ מסמנת-נקרא, הפעמון-סופר-רק
-- read_at is null.
alter table public.sent_whatsapp
  add column if not exists read_at timestamptz;
