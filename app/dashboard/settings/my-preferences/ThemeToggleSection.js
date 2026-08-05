'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setThemePreference } from '../../lib/fieldPreferences';

const OPTIONS = [
  { value: 'light', label: '☀️ בהיר' },
  { value: 'dark', label: '🌙 כהה' },
  { value: 'system', label: '🖥️ לפי המערכת' },
];

// טוגל ערכת נושא - שינוי כותב מיד ל-profiles.theme_preference (server
// action) ואז router.refresh() שגורם ל-app/layout.js (root, לא dashboard)
// לקרוא מחדש את ההעדפה ולעדכן data-theme על ה-<html>.
export default function ThemeToggleSection({ initialTheme }) {
  const [theme, setTheme] = useState(initialTheme);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(value) {
    setTheme(value);
    if (value === 'system') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', value);
    }
    startTransition(async () => {
      await setThemePreference(value);
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>ערכת נושא</div>
      <div style={{ display: 'flex', gap: 8, opacity: isPending ? 0.7 : 1 }}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => handleChange(o.value)}
            disabled={isPending}
            style={{
              border: '1px solid ' + (theme === o.value ? 'var(--text)' : 'var(--border)'),
              background: theme === o.value ? 'var(--text)' : 'var(--bg)',
              color: theme === o.value ? 'var(--bg)' : 'var(--text-secondary)',
              borderRadius: 999, padding: '7px 16px', fontSize: 12.5, cursor: 'pointer', fontWeight: 500,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
