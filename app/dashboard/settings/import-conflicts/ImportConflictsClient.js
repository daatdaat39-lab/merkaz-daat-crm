'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { resolveImportConflict, bulkResolveGroupConflicts } from '../../contacts/actions';

const TWIN_ELIGIBLE = new Set(['phone', 'email']);
const RESOLUTION_LABEL = { kept_existing: 'השאר קיים', used_new: 'החלף בחדש', kept_both: 'שמור את שניהם' };

function resolveFieldLabel(fieldKey, fieldLabel, workspaceName, extraFieldsByWorkspaceName) {
  if (!fieldKey.startsWith('extra:')) return fieldLabel;
  const key = fieldKey.slice(6);
  const def = (extraFieldsByWorkspaceName[workspaceName] || []).find((f) => f.key === key);
  return def?.label || fieldLabel;
}

function groupHref(g) {
  const params = new URLSearchParams();
  params.set('field', g.fieldKey);
  if (g.workspaceId) params.set('workspace', g.workspaceId);
  return `/dashboard/settings/import-conflicts?${params.toString()}`;
}

export default function ImportConflictsClient({
  groups, selectedField, selectedWorkspace, page, pageSize,
  selectedGroupRows, selectedGroupTotal, extraFieldsByWorkspaceName,
}) {
  const [resolvedIds, setResolvedIds] = useState(() => new Set());
  const [groupResolution, setGroupResolution] = useState('kept_existing');
  const [groupResult, setGroupResult] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  const selectedGroup = groups.find((g) => g.fieldKey === selectedField && (g.workspaceId || '') === (selectedWorkspace || ''));
  const visibleRows = selectedGroupRows.filter((c) => !resolvedIds.has(c.id));
  const totalPages = selectedGroup ? Math.max(1, Math.ceil(selectedGroupTotal / pageSize)) : 1;

  function handleResolve(conflictId, resolution) {
    setError(null);
    startTransition(async () => {
      const res = await resolveImportConflict(conflictId, resolution);
      if (res?.error) { setError(res.error); return; }
      setResolvedIds((prev) => new Set(prev).add(conflictId));
      router.refresh();
    });
  }

  function handleGroupResolve() {
    if (!selectedGroup) return;
    setError(null);
    setGroupResult(null);
    startTransition(async () => {
      const res = await bulkResolveGroupConflicts(selectedGroup.fieldKey, selectedGroup.workspaceId, groupResolution);
      if (res?.error) { setError(res.error); return; }
      setGroupResult(res);
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין קונפליקטים ממתינים לבדיקה 🎉</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ color: '#b23b2f', fontSize: 12.5 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {groups.map((g) => {
          const isSelected = g === selectedGroup;
          const label = resolveFieldLabel(g.fieldKey, g.fieldLabel, g.workspaceName, extraFieldsByWorkspaceName);
          return (
            <Link key={`${g.fieldKey}|${g.workspaceId || ''}`} href={groupHref(g)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 6, textDecoration: 'none', fontSize: 13,
              background: isSelected ? 'var(--bg-secondary, #f0f0f0)' : 'transparent',
              border: '1px solid var(--border)', color: 'inherit',
            }}>
              <span>{label} · {g.workspaceName || '—'}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{g.count} ממתינים</span>
            </Link>
          );
        })}
      </div>

      {selectedGroup && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            פתרון לכל הקבוצה: {resolveFieldLabel(selectedGroup.fieldKey, selectedGroup.fieldLabel, selectedGroup.workspaceName, extraFieldsByWorkspaceName)} · {selectedGroup.workspaceName} ({selectedGroup.count} ממתינים)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={groupResolution} onChange={(e) => setGroupResolution(e.target.value)} style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
              <option value="kept_existing">השאר קיים</option>
              <option value="used_new">החלף בחדש</option>
              {TWIN_ELIGIBLE.has(selectedGroup.fieldKey) && <option value="kept_both">שמור את שניהם</option>}
            </select>
            <button type="button" disabled={isPending} onClick={handleGroupResolve} style={{ ...btnStyle(), background: '#111', color: '#fff', border: 'none' }}>
              בצע לכל הקבוצה ({selectedGroup.count})
            </button>
          </div>
          {groupResult && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              נפתרו {groupResult.resolved} מתוך {groupResult.attempted} ({RESOLUTION_LABEL[groupResolution]}).
              {groupResult.resolved < groupResult.attempted && ' חלק דולגו (למשל שדה-תאום כבר תפוס) - נשארו ממתינים לבדיקה פרטנית.'}
            </div>
          )}
        </div>
      )}

      {selectedGroup && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleRows.map((c) => {
            const contactName = `${c.contacts?.first || ''} ${c.contacts?.last || ''}`.trim() || 'איש קשר';
            const label = resolveFieldLabel(c.field_key, c.field_label, c.workspaces?.name, extraFieldsByWorkspaceName);
            const twinEligible = TWIN_ELIGIBLE.has(c.field_key);
            return (
              <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                  <a href={`/dashboard/contacts/${c.contact_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                    {contactName} →
                  </a>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.source_system ? `${c.source_system}` : ''}{c.batch_label ? ` · ${c.batch_label}` : ''}
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
          {visibleRows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>כל השורות בעמוד הזה טופלו - רענן או עבור לעמוד הבא.</div>}

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
              {page > 1 && (
                <Link href={`${groupHref(selectedGroup)}&page=${page - 1}`} style={{ color: 'inherit' }}>← הקודם</Link>
              )}
              <span style={{ color: 'var(--text-secondary)' }}>עמוד {page} מתוך {totalPages}</span>
              {page < totalPages && (
                <Link href={`${groupHref(selectedGroup)}&page=${page + 1}`} style={{ color: 'inherit' }}>הבא →</Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle() {
  return {
    background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px',
    fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
  };
}
