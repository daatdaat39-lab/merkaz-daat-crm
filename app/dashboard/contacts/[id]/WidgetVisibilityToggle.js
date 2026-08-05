'use client';

import { useState, useTransition, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toggleWidgetVisibility } from '../../lib/fieldPreferences';

const WIDGETS = [
  { key: 'donor_stats', label: 'קובייה: נתוני תרומה' },
  { key: 'student_stats', label: 'קובייה: מצב לימודים' },
];

// אותו רכיב בדיוק כמו ExtraFieldVisibilityToggle (portal + מיקום מ-
// getBoundingClientRect כדי לא להיחתך בחלון צף) - הפעם לא אילו שדות
// בתוך קובייה, אלא אילו קוביות שלמות מוצגות בכלל בכרטיס איש הקשר
// (העדפה אישית, פר-מחלקה, ר' app/dashboard/lib/fieldPreferences.js)
export default function WidgetVisibilityToggle({ workspaceId, hiddenKeys = [] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [isPending, startTransition] = useTransition();
  const buttonRef = useRef(null);
  const router = useRouter();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 220;
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

  function handleToggle(widgetKey) {
    startTransition(async () => {
      await toggleWidgetVisibility(workspaceId, widgetKey);
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="בחירת קוביות מוצגות (אישי, רק אצלך)"
        style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '3px 8px', color: '#6b6b6b' }}
      >
        ⚙ קוביות
      </button>

      {open && coords && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: coords.top, left: coords.left, background: 'var(--bg)', border: '1px solid #e5e5e5',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 220, maxHeight: '60vh', overflowY: 'auto',
            zIndex: 9999, padding: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 6 }}>
              קוביות מוצגות (אישי)
            </div>
            {WIDGETS.map((w) => {
              const checked = !hiddenKeys.includes(w.key);
              return (
                <label key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', fontSize: 12.5, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>
                  <input type="checkbox" checked={checked} disabled={isPending} onChange={() => handleToggle(w.key)} />
                  {w.label}
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
