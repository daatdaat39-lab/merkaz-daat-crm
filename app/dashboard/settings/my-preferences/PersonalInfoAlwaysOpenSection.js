'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { togglePersonalInfoAlwaysOpen } from '../../lib/fieldPreferences';
import { PERSONAL_INFO_ALWAYS_OPEN_CANDIDATES } from '../../lib/contactFieldsList';

// אישי-לגמרי, לא per-מחלקה (בניגוד ל-hidden_extra_fields) - "פרטים
// אישיים" זהה-במבנה לכל אנשי-הקשר בכל-המחלקות. טלפון/מייל/עיר כבר
// תמיד-פתוחים כברירת-מחדל גלובלית (לא-ברשימה כאן, אי-אפשר לכבות אותם).
export default function PersonalInfoAlwaysOpenSection({ initialAlwaysOpen }) {
  const [alwaysOpen, setAlwaysOpen] = useState(initialAlwaysOpen);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(fieldKey) {
    setAlwaysOpen((prev) => (prev.includes(fieldKey) ? prev.filter((k) => k !== fieldKey) : [...prev, fieldKey]));
    startTransition(async () => {
      await togglePersonalInfoAlwaysOpen(fieldKey);
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>פרטים אישיים - מה תמיד פתוח</div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
        טלפון, מייל ועיר תמיד מוצגים. סמן כאן עוד שדות שתרצה לראות תמיד בכרטיס איש קשר, בלי ללחוץ "עוד פרטים".
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: isPending ? 0.7 : 1 }}>
        {PERSONAL_INFO_ALWAYS_OPEN_CANDIDATES.map((f) => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={alwaysOpen.includes(f.key)} disabled={isPending} onChange={() => handleToggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}
