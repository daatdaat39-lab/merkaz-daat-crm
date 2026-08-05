'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleExtraFieldVisibility } from '../../lib/fieldPreferences';

export default function MyPreferencesClient({ workspaces, hiddenByWorkspace }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {workspaces.map((w) => (
        <WorkspaceFieldsSection key={w.id} workspace={w} hiddenKeys={hiddenByWorkspace[w.id] || []} />
      ))}
    </div>
  );
}

function WorkspaceFieldsSection({ workspace, hiddenKeys }) {
  const [hidden, setHidden] = useState(hiddenKeys);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const fields = workspace.fields || [];

  function handleToggle(fieldKey) {
    setHidden((prev) => (prev.includes(fieldKey) ? prev.filter((k) => k !== fieldKey) : [...prev, fieldKey]));
    startTransition(async () => {
      await toggleExtraFieldVisibility(workspace.id, fieldKey);
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{workspace.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: isPending ? 0.7 : 1 }}>
        {fields.map((f) => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!hidden.includes(f.key)} disabled={isPending} onChange={() => handleToggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}
