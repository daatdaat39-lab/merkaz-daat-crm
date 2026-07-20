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
      const t = setTimeout(() => setToast(null), 2200);
      return () => clearTimeout(t);
    }
    window.addEventListener('crm:celebrate', handler);
    return () => window.removeEventListener('crm:celebrate', handler);
  }, []);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, insetInlineStart: 24, zIndex: 2000,
        background: '#0a0a0a', color: '#fff', borderRadius: 999, padding: '11px 22px',
        fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      }}
    >
      {toast}
    </div>
  );
}
