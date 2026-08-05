'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign } from './actions';

export const CAMPAIGN_CHANNELS = ['שיחה', 'וואטסאפ', 'מייל', 'פגישה'];

export default function NewCampaignForm({ workspaceId }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState(CAMPAIGN_CHANNELS[0]);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    setError(null);
    if (!name.trim()) { setError('יש למלא שם קמפיין'); return; }
    startTransition(async () => {
      const res = await createCampaign(workspaceId, name, channel);
      if (res?.error) { setError(res.error); return; }
      setOpen(false); setName('');
      router.push(`/dashboard/sales/campaigns/${res.id}`);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6,
        padding: '7px 16px', fontSize: 13, cursor: 'pointer',
      }}>
        + קמפיין חדש
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="שם הקמפיין..."
        autoFocus
        style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
      />
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
      >
        {CAMPAIGN_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" onClick={handleCreate} disabled={isPending} style={{
        background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
      }}>
        יצירה
      </button>
      <button type="button" onClick={() => { setOpen(false); setError(null); }} style={{
        background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
      }}>
        ביטול
      </button>
      {error && <span style={{ color: '#b23b2f', fontSize: 12 }}>{error}</span>}
    </div>
  );
}
