'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// עטיפת החלון הצף - אותו דפוס בדיוק שכבר קיים ב-AddContactForm.js
// (position:fixed;inset:0 + לחיצה בחוץ סוגרת), בתוספת מקש Escape.
// סגירה = router.back() - זה מחזיר בדיוק למצב שהיה לפני הפתיחה, כי
// הפתיחה עצמה לא הייתה ניווט אמיתי (intercepting route).
export default function ContactModalShell({ children }) {
  const router = useRouter();

  function handleClose() {
    router.back();
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10, width: 1000, maxWidth: '100%',
          maxHeight: '90vh', overflowY: 'auto', position: 'relative',
        }}
      >
        <button
          onClick={handleClose}
          style={{
            position: 'sticky', top: 12, insetInlineEnd: 12, float: 'inline-end',
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: '50%',
            width: 32, height: 32, cursor: 'pointer', fontSize: 16, lineHeight: 1, zIndex: 1,
          }}
          title="סגירה"
        >
          ✕
        </button>
        <div style={{ clear: 'both' }}>{children}</div>
      </div>
    </div>
  );
}
