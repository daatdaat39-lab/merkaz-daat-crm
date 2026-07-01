import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * לקוח Supabase עם הרשאות מנהל-על (service role).
 * שימוש בקובץ זה מותר אך ורק בקוד שרץ בצד השרת (server actions / route handlers),
 * לעולם לא בקומפוננטת client — המפתח הזה עוקף את כל ה-RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY לא מוגדר. יש להוסיף אותו במשתני הסביבה ב-Vercel כדי שהזמנת משתמשים תעבוד.'
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
