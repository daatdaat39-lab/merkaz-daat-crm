// ספריית עזר לאימות OTP (לא 'use server' - נקראת ממקומות שכבר
// מריצים server actions/route handlers משלהם, ר' app/login/actions.js
// ו-contacts/actions.js). מייל בלבד בשלב זה - InforU עדיין לא חושף
// נקודת קצה ל-SMS (רק WhatsApp, ר' lib/inforu/whatsapp.js), וגם זה
// לא מוגדר בסביבה כרגע - אין תשתית SMS אמיתית להתחבר אליה עדיין.
import crypto from 'crypto';
import { createAdminClient } from '../../../lib/supabase/admin';
import { getAccessToken } from '../../../lib/gmail/client';
import { sendEmail } from '../../../lib/gmail/send';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// שולפת חיבור Gmail-send כלשהו במערכת - OTP הוא מייל מערכתי, לא
// תלוי-מחלקה כמו מייל רגיל ליצירת קשר עם איש קשר (sendContactEmail)
async function getAnySendConnection(admin) {
  const { data } = await admin
    .from('email_connections').select('email_address, refresh_token').eq('purpose', 'send').limit(1).single();
  return data || null;
}

export async function sendOtpEmail(toEmail, code) {
  const admin = createAdminClient();
  const connection = await getAnySendConnection(admin);
  if (!connection) {
    throw new Error('לא הוגדר חיבור מייל לשליחת קודי אימות - יש לחבר תיבת Gmail בהגדרות');
  }
  const accessToken = await getAccessToken(connection.refresh_token);
  await sendEmail(accessToken, {
    from: connection.email_address,
    to: toEmail,
    subject: 'קוד אימות למרכז דעת CRM',
    body: `קוד האימות שלך: ${code}\n\nהקוד בתוקף ל-${CODE_TTL_MINUTES} דקות. אם לא ביקשת קוד זה, אפשר להתעלם מההודעה.`,
  });
}

// יוצר קוד אקראי בן 6 ספרות, שומר hash בלבד + תוקף, ושולח למייל
export async function generateAndSendOtp(userId, email, purpose) {
  const admin = createAdminClient();
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();

  const { error } = await admin.from('otp_codes').insert({
    user_id: userId, code_hash: hashCode(code), purpose, expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);

  await sendOtpEmail(email, code);
}

// מאמת קוד מול השורה הפעילה האחרונה של המשתמש/מטרה - חוסם אחרי
// MAX_ATTEMPTS ניסיונות שגויים, ומסמן consumed_at בהצלחה כדי שלא
// יהיה ניתן לשימוש חוזר
export async function verifyOtp(userId, code, purpose) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('otp_codes')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId).eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!row) return { error: 'לא נמצא קוד פעיל - יש לבקש קוד חדש' };
  if (new Date(row.expires_at) < new Date()) return { error: 'הקוד פג תוקף - יש לבקש קוד חדש' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'יותר מדי ניסיונות שגויים - יש לבקש קוד חדש' };

  if (hashCode(code) !== row.code_hash) {
    await admin.from('otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { error: 'קוד שגוי' };
  }

  await admin.from('otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
  return { success: true };
}
