import { createBrowserClient } from '@supabase/ssr';

// מופע-יחיד (singleton) בכוונה - לא ליצור createBrowserClient() חדש בכל
// קריאה. הדף הזה מרכיב הרבה קומפוננטות חיות-לאורך-כל-הזמן שכל אחת
// קוראת createClient() בנפרד (NewLeadToast/ConcurrentInquiryToast/
// PendingAutomationWatcher/IdleLock/ChatPanel/DonationCelebrationToast) -
// כל createBrowserClient() חדש הוא GoTrueClient נפרד עם auto-refresh
// עצמאי משלו. כמה מופעים כאלה חיים בו-זמנית באותו טאב יוצרים מרוץ: אחרי
// שהתנתקות-שרתית (signOut ב-Server Action) ניקתה את עוגיית-הסשן, מופע
// "זומבי" ישן עדיין עם טוקן-רענון תקף בזיכרון יכול לרענן ולכתוב מחדש
// עוגיית-סשן תקפה כמה שניות אחר-כך - בדיוק התופעה שדווחה בפועל
// ("יציאה" לא מתנתקת אצל טלפנים שהשאירו טאב פתוח זמן רב).
let browserClient = null;
export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return browserClient;
}
