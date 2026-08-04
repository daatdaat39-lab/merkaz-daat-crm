'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getExtraFields } from '../../components/pipelines';
import { toggleExtraFieldVisibility } from '../../lib/fieldPreferences';

// אייקון ⚙ קטן ליד כותרת קובייה (DonorStatsTile/StudentStatsTile) -
// פותח פופ-אובר מהיר להתאמה אישית של אילו שדות מחלקתיים מוצגים
// לצופה הנוכחי בלבד (לא משפיע על אף אחד אחר). ר' גם עמוד "ההעדפות
// שלי" (settings/my-preferences) - אותה פעולה בדיוק, ריכוז של כל
// המחלקות במקום אחד.
export default function ExtraFieldVisibilityToggle({ workspaceId, workspaceName, hiddenKeys = [] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const fields = getExtraFields(workspaceName);

  if (fields.length === 0) return null;

  function handleToggle(fieldKey) {
    startTransition(async () => {
      await toggleExtraFieldVisibility(workspaceId, fieldKey);
      router.refresh();
    });
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="התאמת שדות מוצגים (אישי, רק אצלך)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', color: 'inherit', opacity: 0.65 }}
      >
        ⚙
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 20, insetInlineStart: 0, background: '#fff', border: '1px solid #e5e5e5',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 230, zIndex: 50, padding: 10,
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
        </>
      )}
    </div>
  );
}
