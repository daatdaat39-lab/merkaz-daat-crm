'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyLoginOtp, startLoginOtp } from '../login/actions';

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
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{
        background: '#FFFDF6', border: '1px solid #DFD2AC', borderRadius: 12,
        padding: 32, width: 340, boxShadow: '0 6px 18px rgba(36,31,24,.08)',
      }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', textAlign: 'center', marginTop: 0, fontSize: 20 }}>אימות דו-שלבי</h1>
        <p style={{ textAlign: 'center', color: '#6B6151', fontSize: 13, marginTop: -4 }}>הזן את הקוד שנשלח למייל שלך</p>
        <label style={{ fontSize: 12, color: '#6B6151' }}>קוד אימות</label>
        <input
          value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoFocus
          style={{ width: '100%', padding: 10, margin: '6px 0 14px', borderRadius: 7, border: '1px solid #DFD2AC', fontSize: 18, textAlign: 'center', letterSpacing: 4 }}
        />
        {error && <div style={{ color: '#9C4A3C', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading || code.length !== 6} style={{
          width: '100%', padding: 11, borderRadius: 8, border: 'none',
          background: '#1F4A41', color: '#fff', fontWeight: 600, cursor: 'pointer', marginBottom: 10,
        }}>
          {loading ? 'מאמת...' : 'אימות'}
        </button>
        <button type="button" onClick={handleResend} disabled={resending || cooldown > 0} style={{
          width: '100%', padding: 9, borderRadius: 8, border: '1px solid #DFD2AC',
          background: 'none', color: '#6B6151', cursor: cooldown > 0 ? 'default' : 'pointer', fontSize: 12.5,
        }}>
          {cooldown > 0 ? `שליחה חוזרת (${cooldown})` : resending ? 'שולח...' : 'שלח קוד מחדש'}
        </button>
      </form>
    </div>
  );
}
