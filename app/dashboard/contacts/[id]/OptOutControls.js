'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setContactOptOut } from '../actions';

// סימון "הלקוח ביקש לא לקבל הודעות" לפי ערוץ (migration 0186). סימון פעיל חוסם
// שליחה בערוץ הזה (ידנית ואוטומטית) עד לביטול, ומוצג בבירור על הכרטיס כדי
// שנציג אחר לא ישלח בטעות. הסימון פתוח לכל נציג עם גישה לאיש הקשר.
const CHANNELS = [
  { key: 'email', label: 'מייל', field: 'email_optout_at' },
  { key: 'whatsapp', label: 'וואטסאפ', field: 'whatsapp_optout_at' },
];

export default function OptOutControls({ contact }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function toggle(channel, enable) {
    if (enable && !confirm(`לסמן שהלקוח ביקש לא לקבל הודעות ב${channel.label}? לא ניתן יהיה לשלוח לו ב${channel.label} (ידנית או אוטומטית) עד שתבטל את הסימון.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await setContactOptOut(contact.id, channel.key, enable);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const anyActive = CHANNELS.some((c) => contact[c.field]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '10px 0 0', fontSize: 12 }}>
      <span style={{ color: anyActive ? 'var(--k-danger-text)' : 'var(--k-text-muted)', fontWeight: anyActive ? 600 : 400 }}>
        {anyActive ? 'לא לפנות:' : 'הלקוח ביקש לא לקבל הודעות?'}
      </span>
      {CHANNELS.map((c) => {
        const at = contact[c.field];
        const title = at
          ? `סומן ב-${new Date(at).toLocaleDateString('he-IL')}${contact.optout_source === 'customer_keyword' ? ' (הלקוח כתב בקשת הסרה)' : ''}${contact.optout_note ? ` - ${contact.optout_note}` : ''}. לחיצה מבטלת את הסימון.`
          : `סימון: לא לפנות ב${c.label}`;
        return (
          <button
            key={c.key}
            type="button"
            title={title}
            disabled={isPending || contact.frozen}
            onClick={() => toggle(c, !at)}
            style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, cursor: contact.frozen ? 'default' : 'pointer',
              border: `1px solid ${at ? 'transparent' : 'var(--k-border)'}`,
              background: at ? 'var(--k-danger-bg)' : 'var(--k-surface)',
              color: at ? 'var(--k-danger-text)' : 'var(--k-text-muted)',
              fontWeight: at ? 600 : 400,
            }}
          >
            {at ? `🚫 ${c.label} · ${new Date(at).toLocaleDateString('he-IL')} ✕` : c.label}
          </button>
        );
      })}
      {error && <span role="alert" style={{ color: 'var(--k-danger-text)' }}>שגיאה: {error}</span>}
    </div>
  );
}
