'use server';

import { cookies } from 'next/headers';
import { createClient } from '../../lib/supabase/server';
import { generateAndSendOtp, verifyOtp } from '../dashboard/lib/otp';

// שני השלבים בזרימת ה-OTP בהתחברות - נקראים אחרי signInWithPassword
// שכבר הצליח בצד הלקוח (הסשן כבר קיים בעוגיות בשלב הזה, ר' login/page.js)
export async function startLoginOtp() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: 'משתמש לא מזוהה' };

  try {
    await generateAndSendOtp(user.id, user.email, 'login');
  } catch (err) {
    return { error: err.message };
  }
  return { success: true };
}

export async function verifyLoginOtp(code) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'משתמש לא מזוהה' };

  const result = await verifyOtp(user.id, code, 'login');
  if (result.error) return result;

  cookies().set('otp_verified', 'true', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
  });
  return { success: true };
}
