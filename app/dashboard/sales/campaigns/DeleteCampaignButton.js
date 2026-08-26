'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCampaign } from './actions';

// כפתור מחיקת קמפיין - מנהל/בעלים בלבד (השער האמיתי הוא server action
// deleteCampaign; העמוד הזה כבר manager-only ברמת page.js). אישור-כפול
// בתוך אותו כפתור (בלי modal נפרד) כדי למנוע מחיקה בטעות בלחיצה אחת.
export default function DeleteCampaignButton({ campaignId, campaignName }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    setError(null);
    startTransition(async () => {
      const res = await deleteCampaign(campaignId);
      if (res?.error) { setError(res.error); setConfirming(false); return; }
      router.refresh();
    });
  }

  function handleCancel(e) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setError(null);
  }

  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: 11.5, color: '#b23b2f' }}>למחוק את "{campaignName}"?</span>
        <button type="button" onClick={handleClick} disabled={isPending} style={{
          background: '#b23b2f', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer',
        }}>
          {isPending ? 'מוחק...' : 'כן, מחק'}
        </button>
        <button type="button" onClick={handleCancel} disabled={isPending} style={{
          background: 'none', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer',
        }}>
          ביטול
        </button>
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={handleClick} title="מחיקת קמפיין" style={{
        background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 13, padding: '4px 6px',
      }}>
        🗑
      </button>
      {error && <span style={{ fontSize: 11, color: '#b23b2f' }}>{error}</span>}
    </>
  );
}
