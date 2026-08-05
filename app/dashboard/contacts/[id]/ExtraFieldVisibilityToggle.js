'use client';

import { useState, useTransition, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toggleExtraFieldVisibility } from '../../lib/fieldPreferences';

// אייקון ⚙ קטן ליד כותרת קובייה (DonorStatsTile/StudentStatsTile) -
// פותח פופ-אובר מהיר להתאמה אישית של אילו שדות מחלקתיים מוצגים
// לצופה הנוכחי בלבד (לא משפיע על אף אחד אחר). ר' גם עמוד "ההעדפות
// שלי" (settings/my-preferences) - אותה פעולה בדיוק, ריכוז של כל
// המחלקות במקום אחד.
//
// הפופ-אובר מרונדר ב-portal ישירות ל-document.body (לא בתוך ה-DOM
// המקומי של הקובייה) כי הוא לרוב פתוח בתוך חלון צף (FloatingWindowsHost)
// עם overflow:hidden/auto - position:absolute רגיל היה נחתך שם. המיקום
// מחושב מ-getBoundingClientRect של הכפתור בכל פתיחה.
export default function ExtraFieldVisibilityToggle({ workspaceId, fields = [], hiddenKeys = [] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [isPending, startTransition] = useTransition();
  const buttonRef = useRef(null);
  const router = useRouter();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 230;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    setCoords({ top: rect.bottom + 4, left });

    function close() { setOpen(false); }
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  if (fields.length === 0) return null;

  function handleToggle(fieldKey) {
    startTransition(async () => {
      await toggleExtraFieldVisibility(workspaceId, fieldKey);
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="התאמת שדות מוצגים (אישי, רק אצלך)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', color: 'inherit', opacity: 0.65 }}
      >
        ⚙
      </button>

      {open && coords && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: coords.top, left: coords.left, background: 'var(--bg)', border: '1px solid #e5e5e5',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 230, maxHeight: '60vh', overflowY: 'auto',
            zIndex: 9999, padding: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 6 }}>
              שדות מוצגים (אישי)
            </div>
            {fields.map((f) => {
              const checked = !hiddenKeys.includes(f.key);
              return (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', fontSize: 12.5, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>
                  <input type="checkbox" checked={checked} disabled={isPending} onChange={() => handleToggle(f.key)} />
                  {f.label}
                </label>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
