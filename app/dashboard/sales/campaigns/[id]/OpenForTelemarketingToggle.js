'use client';

import { useState, useTransition } from 'react';
import { setCampaignOpenForTelemarketing } from '../actions';

// כפתור-מתג בכותרת עמוד הקמפיין - שולט אם הקמפיין מופיע בכלל ברשימת
// "תור שיחות" של תפקיד "טלפן" הנעול (ר' migration 0096). מנהל/נציג
// רגיל ממשיכים לראות/לבדוק את הקמפיין תמיד, גם כשהוא "סגור".
export default function OpenForTelemarketingToggle({ campaignId, initialOpen }) {
  const [open, setOpen] = useState(initialOpen);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !open;
    setOpen(next);
    startTransition(async () => {
      const res = await setCampaignOpenForTelemarketing(campaignId, next);
      if (res?.error) setOpen(!next);
    });
  }

  return (
    <button
      type="button" onClick={handleClick} disabled={isPending}
      title={open ? 'לחצו כדי לסגור את הקמפיין לטלפנים' : 'לחצו כדי לפתוח את הקמפיין לטלפנים'}
      style={{
        fontSize: 12.5, color: open ? 'var(--green)' : 'var(--text-secondary)', textDecoration: 'none',
        border: `1px solid ${open ? 'var(--green)' : 'var(--border, #e5e5e5)'}`, background: open ? 'var(--green-bg)' : 'transparent',
        borderRadius: 6, padding: '6px 12px', whiteSpace: 'nowrap', cursor: 'pointer',
      }}
    >
      {open ? '🔓 פתוח לטלפניה' : '🔒 סגור לטלפניה'}
    </button>
  );
}
