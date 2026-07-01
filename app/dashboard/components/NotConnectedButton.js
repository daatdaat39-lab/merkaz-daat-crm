'use client';

import { useState } from 'react';

/**
 * כפתור לפעולות שעדיין לא מחוברות למערכת אמיתית (וואטסאפ, מייל, שיחות, AI, מסמכים וכו').
 * בלחיצה מציג הודעת "עדיין לא מחובר" במקום לבצע פעולה בפועל.
 */
export default function NotConnectedButton({ icon, label, message, variant = 'default', style = {} }) {
  const [toast, setToast] = useState(null);

  const handleClick = () => {
    setToast(message || `${label} — עדיין לא מחובר`);
    setTimeout(() => setToast(null), 2400);
  };

  const baseStyle =
    variant === 'primary'
      ? { background: 'var(--text)', color: '#fff', border: '1px solid var(--text)' }
      : variant === 'icon'
      ? { background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', width: 34, height: 34, padding: 0, justifyContent: 'center' }
      : { background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: variant === 'icon' ? 0 : '7px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          ...baseStyle,
          ...style,
        }}
        title={label}
      >
        {icon && <span>{icon}</span>}
        {variant !== 'icon' && <span>{label}</span>}
      </button>
      {toast && <div className="toast-not-connected">⚠ {toast}</div>}
    </>
  );
}
