'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

const WARNING_AFTER_MS = 20 * 60 * 1000; // 20 דק' חוסר פעילות - מציג אזהרה
const LOCK_AFTER_MS = 23 * 60 * 1000; // עוד 3 דק' אחרי האזהרה - נועל בפועל
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'wheel'];
const RESET_THROTTLE_MS = 5000; // לא צריך לאפס טיימרים בכל תזוזת עכבר בודדת

// נעילת מסך אחרי חוסר פעילות - לא מוציא מהחשבון (הסשן נשאר תקף), רק
// חוסם אינטראקציה עד שמזינים סיסמה מחדש. שונה מהתנתקות מלאה: מתאים
// למחשב משותף שנשאר פתוח באמצע יום עבודה עם מידע אישי של פונים.
export default function IdleLock({ userEmail }) {
  const [status, setStatus] = useState('active'); // active | warning | locked
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const warningTimeoutRef = useRef(null);
  const lockTimeoutRef = useRef(null);
  const lastResetRef = useRef(0);
  const statusRef = useRef('active');
  const router = useRouter();

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    function scheduleTimers() {
      clearTimeout(warningTimeoutRef.current);
      clearTimeout(lockTimeoutRef.current);
      warningTimeoutRef.current = setTimeout(() => setStatus('warning'), WARNING_AFTER_MS);
      lockTimeoutRef.current = setTimeout(() => setStatus('locked'), LOCK_AFTER_MS);
    }

    function handleActivity() {
      if (statusRef.current === 'locked') return; // בזמן נעילה, פעילות לא מבטלת אותה - רק סיסמה
      const now = Date.now();
      if (now - lastResetRef.current < RESET_THROTTLE_MS && statusRef.current === 'active') return;
      lastResetRef.current = now;
      if (statusRef.current === 'warning') setStatus('active');
      scheduleTimers();
    }

    scheduleTimers();
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, handleActivity, { passive: true });
    return () => {
      clearTimeout(warningTimeoutRef.current);
      clearTimeout(lockTimeoutRef.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, handleActivity);
    };
  }, []);

  async function handleUnlock(e) {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: userEmail, password });
    setIsPending(false);
    if (signInError) { setError('סיסמה שגויה'); return; }
    setPassword('');
    setStatus('active');
    lastResetRef.current = Date.now();
    clearTimeout(warningTimeoutRef.current);
    clearTimeout(lockTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => setStatus('warning'), WARNING_AFTER_MS);
    lockTimeoutRef.current = setTimeout(() => setStatus('locked'), LOCK_AFTER_MS);
  }

  async function handleSignOutInstead() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (status === 'warning') {
    return (
      <div style={{
        position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 900,
        background: '#a4691f', color: '#fff', borderRadius: 10, padding: '14px 18px',
        fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxWidth: 280,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>⏳ המערכת תינעל בעוד כ-3 דקות</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>בגלל חוסר פעילות. כל תזוזה או הקלדה תבטל את זה.</div>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,20,19,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
      }}>
        <form
          onSubmit={handleUnlock}
          style={{ background: '#fff', borderRadius: 14, padding: '32px 30px', width: 320, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
        >
          <div style={{ fontSize: 34, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>המערכת ננעלה</div>
          <div style={{ fontSize: 12.5, color: '#6b6b6b', marginBottom: 18 }}>בגלל חוסר פעילות ממושך. הזן סיסמה כדי להמשיך — {userEmail}</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה"
            autoFocus
            style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, textAlign: 'center' }}
          />
          {error && <div style={{ color: '#b23b2f', fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            disabled={isPending || !password}
            style={{ width: '100%', background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1, marginBottom: 12 }}
          >
            {isPending ? 'בודק...' : 'פתיחת נעילה'}
          </button>
          <button
            type="button"
            onClick={handleSignOutInstead}
            style={{ background: 'none', border: 'none', color: '#9b9b9b', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            להתנתק במקום
          </button>
        </form>
      </div>
    );
  }

  return null;
}
