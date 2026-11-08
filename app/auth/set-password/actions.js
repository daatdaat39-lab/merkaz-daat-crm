'use server';

import { createClient } from '../../../lib/supabase/server';

// נקרא מעמוד קביעת הסיסמה אחרי שהמשתמש בחר סיסמה חדשה בהצלחה - מוריד את
// דגל "חובה להחליף סיסמה" (profiles.must_change_password) שהמנהל הדליק
// כשמסר סיסמה זמנית. פועל רק על המשתמש המחובר עצמו.
export async function clearMustChangePassword() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'לא מחובר' };
  const { error } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id);
  if (error) return { error: error.message };
  return { success: true };
}
