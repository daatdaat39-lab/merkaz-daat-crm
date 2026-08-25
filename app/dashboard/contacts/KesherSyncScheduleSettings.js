'use client';

// שולט בקצב ריצת ה-cron האוטומטי (app/api/cron/sync-kesher) - לא דורש
// דיפלוי כדי לשנות: ה-workflow עצמו (.github/workflows/sync-kesher.yml)
// רץ תמיד כל 5 דקות, אבל בפועל מריץ סנכרון רק אם עבר interval_minutes
// מהריצה האחרונה. "כל 5 דקות" כאן הוא הריצה הכי תכופה שאפשר לבחור,
// כי זו גם התדירות שה-workflow עצמו בודק בה.
import { useEffect, useState, useTransition } from 'react';
import { getKesherSyncSettings, updateKesherSyncSettings } from './kesherSyncActions';

const OPTIONS = [
  { value: 5, label: 'כל 5 דקות' },
  { value: 15, label: 'כל 15 דקות' },
  { value: 30, label: 'כל חצי שעה' },
  { value: 60, label: 'כל שעה' },
  { value: 360, label: 'כל 6 שעות' },
  { value: 1440, label: 'פעם ביום' },
];

export default function KesherSyncScheduleSettings({ kesherConfigured = false }) {
  const [settings, setSettings] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  useEffect(() => { getKesherSyncSettings().then(setSettings); }, []);

  if (!kesherConfigured || !settings) return null;

  function apply(next) {
    setSettings(next);
    setSaved(false);
    startTransition(async () => {
      const res = await updateKesherSyncSettings(next.interval_minutes, next.enabled);
      if (!res?.error) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    });
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input
          type="checkbox" checked={settings.enabled} disabled={isPending}
          onChange={(e) => apply({ ...settings, enabled: e.target.checked })}
        />
        סנכרון קשר אוטומטי
      </label>
      <select
        value={settings.interval_minutes} disabled={isPending || !settings.enabled}
        onChange={(e) => apply({ ...settings, interval_minutes: Number(e.target.value) })}
        style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
      >
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {saved && <span style={{ color: '#1f7a3d' }}>✓ נשמר</span>}
    </div>
  );
}
