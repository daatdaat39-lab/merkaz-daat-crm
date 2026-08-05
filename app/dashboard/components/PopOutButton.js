'use client';

import { useFloatingWindows } from './FloatingWindows';

// כפתור גנרי "פתיחה כחלון צף" - פותח חלון עם kind/props נתונים,
// שנשאר פתוח (וניתן למזעור) גם כשעוברים לעמוד אחר.
export default function PopOutButton({ windowId, kind, title, windowProps = {}, onOpened, label = '🗗 פתיחה כחלון צף' }) {
  const { openWindow } = useFloatingWindows();

  function handleClick() {
    openWindow({ id: windowId, kind, title, props: windowProps });
    onOpened?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid #e5e5e5',
        borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#666', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
