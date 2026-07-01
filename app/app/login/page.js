'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('התחברות נכשלה: ' + error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleLogin} style={{
        background: '#FFFDF6', border: '1px solid #DFD2AC', borderRadius: 12,
        padding: 32, width: 340, boxShadow: '0 6px 18px rgba(36,31,24,.08)',
      }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', textAlign: 'center', marginTop: 0 }}>מרכז דעת</h1>
        <p style={{ textAlign: 'center', color: '#6B6151', fontSize: 13, marginTop: -8 }}>התחברות למערכת</p>

        <label style={{ fontSize: 12, color: '#6B6151' }}>אימייל</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, margin: '6px 0 14px', borderRadius: 7, border: '1px solid #DFD2AC' }} />

        <label style={{ fontSize: 12, color: '#6B6151' }}>סיסמה</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, margin: '6px 0 18px', borderRadius: 7, border: '1px solid #DFD2AC' }} />

        {error && <div style={{ color: '#9C4A3C', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 11, borderRadius: 8, border: 'none',
          background: '#1F4A41', color: '#fff', fontWeight: 600, cursor: 'pointer',
        }}>
          {loading ? 'מתחבר/ת...' : 'התחברות'}
        </button>
      </form>
    </div>
  );
}
