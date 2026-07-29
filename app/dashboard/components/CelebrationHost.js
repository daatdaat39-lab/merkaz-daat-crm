'use client';

import { useEffect, useState } from 'react';

// מאזין לאירועי celebrate() ומציג בועה קטנה חוגגת בפינת המסך למשך
// כמה שניות - מותקן פעם אחת ב-layout, בלי שום קומפוננטה אחרת צריכה
// לדעת עליו.
export default function CelebrationHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    function handler(e) {
      setToast(e.detail?.message);
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
    window.addEventListener('crm:celebrate', handler);
    return () => window.removeEventListener('crm:celebrate', handler);
  }, []);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
        background: '#fff', color: '#0a0a0a', borderRadius: 16, padding: '18px 34px',
        fontSize: 18, fontWeight: 700, boxShadow: '0 16px 44px rgba(0,0,0,0.18)',
        border: '1px solid #eee', animation: 'crmCelebrateIn 0.28s ease-out', whiteSpace: 'nowrap',
      }}
    >
      {toast}
      <style>{`
        @keyframes crmCelebrateIn {
          from { transform: translateX(-50%) translateY(-16px) scale(0.94); opacity: 0; }
          to { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
