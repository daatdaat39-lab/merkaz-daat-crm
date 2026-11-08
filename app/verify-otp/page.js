'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyLoginOtp, startLoginOtp } from '../login/actions';
import AuthCard, { AuthError, authInputStyle, authLabelStyle, authPrimaryButtonStyle, authSecondaryButtonStyle } from '../components/AuthCard';

// עמוד שלב שני של ההתחברות - מגיע אליו רק כש-OTP_LOGIN_REQUIRED דלוק
// ואין עדיין עוגיית otp_verified תקפה (ר' middleware.js). קוד כבר נשלח
// אוטומטית ע"י login/page.js לפני שהופנה לכאן.
export default function VerifyOtpPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await verifyLoginOtp(code);
    setLoading(false);
    if (res?.error) { setError(res.error); return; }
    router.push('/dashboard');
    router.refresh();
  }

  function handleResend() {
    if (cooldown > 0) return;
    setResending(true);
    startLoginOtp().finally(() => {
      setResending(false);
      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) { clearInterval(interval); return 0; }
          return c - 1;
        });
      }, 1000);
    });
  }

  return (
    <AuthCard title="אימות דו-שלבי" subtitle="הזן את הקוד שנשלח למייל שלך" onSubmit={handleSubmit}>
      <label htmlFor="otp" style={authLabelStyle}>קוד אימות</label>
      <input
        id="otp" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
        style={{ ...authInputStyle, fontSize: 20, textAlign: 'center', letterSpacing: 6 }}
      />
      <AuthError message={error} />
      <button type="submit" disabled={loading || code.length !== 6} style={{ ...authPrimaryButtonStyle(loading || code.length !== 6), marginBottom: 10 }}>
        {loading ? 'מאמת...' : 'אימות'}
      </button>
      <button type="button" onClick={handleResend} disabled={resending || cooldown > 0} style={authSecondaryButtonStyle(cooldown > 0)}>
        {cooldown > 0 ? `שליחה חוזרת (${cooldown})` : resending ? 'שולח...' : 'שלח קוד מחדש'}
      </button>
    </AuthCard>
  );
}
