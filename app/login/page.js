'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { startLoginOtp } from './actions';
import AuthCard, { AuthError, authInputStyle, authLabelStyle, authPrimaryButtonStyle } from '../components/AuthCard';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // הפניה מה-middleware אחרי השבתת חשבון (ר' middleware.js)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('suspended')) {
      setError('החשבון הושבת. יש לפנות למנהל המערכת.');
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      // הודעות Supabase באנגלית - מתרגמים את המקרים השכיחים
      const msg = /banned/i.test(error.message)
        ? 'החשבון הושבת. יש לפנות למנהל המערכת.'
        : /invalid login credentials/i.test(error.message)
          ? 'אימייל או סיסמה שגויים.'
          : error.message;
      setError('התחברות נכשלה: ' + msg);
      return;
    }
    // אימות דו-שלבי - כבוי כברירת מחדל (ר' middleware.js). כשדלוק,
    // שולחים קוד מיד ומפנים לעמוד האימות במקום ישר לדשבורד.
    if (process.env.NEXT_PUBLIC_OTP_LOGIN_REQUIRED === 'true') {
      const res = await startLoginOtp();
      setLoading(false);
      if (res?.error) { setError(res.error); return; }
      router.push('/verify-otp');
      return;
    }
    setLoading(false);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthCard title="התחברות למערכת" onSubmit={handleLogin}>
      <label htmlFor="email" style={authLabelStyle}>אימייל</label>
      <input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} style={authInputStyle} />
      <label htmlFor="password" style={authLabelStyle}>סיסמה</label>
      <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={authInputStyle} />
      <AuthError message={error} />
      <button type="submit" disabled={loading} style={authPrimaryButtonStyle(loading)}>
        {loading ? 'מתחבר/ת...' : 'התחברות'}
      </button>
    </AuthCard>
  );
}