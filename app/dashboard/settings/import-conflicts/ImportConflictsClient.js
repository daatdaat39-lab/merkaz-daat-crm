'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveImportConflict } from '../../contacts/actions';

const TWIN_ELIGIBLE = new Set(['phone', 'email']);

function resolveFieldLabel(conflict, extraFieldsByWorkspaceName) {
  if (!conflict.field_key.startsWith('extra:')) return conflict.field_label;
  const key = conflict.field_key.slice(6);
  const wsName = conflict.workspaces?.name;
  const def = (extraFieldsByWorkspaceName[wsName] || []).find((f) => f.key === key);
  return def?.label || conflict.field_label;
}

export default function ImportConflictsClient({ conflicts, extraFieldsByWorkspaceName = {} }) {
  const [resolvedIds, setResolvedIds] = useState(() => new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  const visible = conflicts.filter((c) => !resolvedIds.has(c.id));

  function handleResolve(conflictId, resolution) {
    setError(null);
    startTransition(async () => {
      const res = await resolveImportConflict(conflictId, resolution);
      if (res?.error) { setError(res.error); return; }
      setResolvedIds((prev) => new Set(prev).add(conflictId));
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין קונפליקטים ממתינים לבדיקה 🎉</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5 }}>{error}</div>}
      {visible.map((c) => {
        const contactName = `${c.contacts?.first || ''} ${c.contacts?.last || ''}`.trim() || 'איש קשר';
        const label = resolveFieldLabel(c, extraFieldsByWorkspaceName);
        const twinEligible = TWIN_ELIGIBLE.has(c.field_key);
        return (
          <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
              <a href={`/dashboard/contacts/${c.contact_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                {contactName} →
              </a>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {c.workspaces?.name}{c.source_system ? ` · ${c.source_system}` : ''}{c.batch_label ? ` · ${c.batch_label}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6 }}>
              <b>{label}</b>: קיים <span style={{ color: 'var(--text-secondary)' }}>"{c.existing_value}"</span> ← בקובץ <span style={{ color: '#b45309' }}>"{c.new_value}"</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" disabled={isPending} onClick={() => handleResolve(c.id, 'kept_existing')} style={btnStyle()}>השאר קיים</button>
              <button type="button" disabled={isPending} onClick={() => handleResolve(c.id, 'used_new')} style={btnStyle()}>החלף בחדש</button>
              {twinEligible && (
                <button type="button" disabled={isPending} onClick={() => handleResolve(c.id, 'kept_both')} style={btnStyle()}>שמור את שניהם</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function btnStyle() {
  return {
    background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px',
    fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
  };
}
