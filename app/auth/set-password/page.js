'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { clearMustChangePassword } from './actions';
import AuthCard, { AuthError, authInputStyle, authLabelStyle, authPrimaryButtonStyle } from '../../components/AuthCard';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 10) {
      setError('הסיסמה חייבת להכיל לפחות 10 תווים');
      return;
    }
    if (password !== confirm) {
      setError('הסיסמאות לא תואמות');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError('שגיאה בשמירת הסיסמה: ' + error.message);
      return;
    }
    await clearMustChangePassword();
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthCard title="ברוכים הבאים" subtitle="בחר סיסמה אישית (לפחות 10 תווים) כדי להמשיך" onSubmit={handleSubmit}>
      <label htmlFor="new-password" style={authLabelStyle}>סיסמה חדשה</label>
      <input id="new-password" type="password" required autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} style={authInputStyle} />
      <label htmlFor="confirm-password" style={authLabelStyle}>אימות סיסמה</label>
      <input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={authInputStyle} />
      <AuthError message={error} />
      <button type="submit" disabled={loading} style={authPrimaryButtonStyle(loading)}>
        {loading ? 'שומר/ת...' : 'שמירה והמשך'}
      </button>
    </AuthCard>
  );
}
