'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
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
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12,
        padding: 32, width: 340, boxShadow: '0 6px 18px rgba(0,0,0,.08)',
      }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', textAlign: 'center', marginTop: 0, fontSize: 20 }}>
          ברוכים הבאים למרכז דעת
        </h1>
        <p style={{ textAlign: 'center', color: '#6b6b6b', fontSize: 13, marginTop: -8 }}>
          בחר סיסמה כדי להשלים את ההרשמה
        </p>
        <label style={{ fontSize: 12, color: '#6b6b6b' }}>סיסמה חדשה</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, margin: '6px 0 14px', borderRadius: 7, border: '1px solid #e5e5e5' }} />
        <label style={{ fontSize: 12, color: '#6b6b6b' }}>אימות סיסמה</label>
        <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
          style={{ width: '100%', padding: 10, margin: '6px 0 18px', borderRadius: 7, border: '1px solid #e5e5e5' }} />
        {error && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 11, borderRadius: 8, border: 'none',
          background: '#0a0a0a', color: '#fff', fontWeight: 600, cursor: 'pointer',
        }}>
          {loading ? 'שומר/ת...' : 'שמירה והמשך'}
        </button>
      </form>
    </div>
  );
}
