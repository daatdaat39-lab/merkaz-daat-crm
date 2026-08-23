'use client';

// באנר קטן בראש כרטיס איש הקשר - מציג קונפליקטי-ייבוא לא-פתורים
// (import_conflicts) שנוגעים ספציפית לאיש הקשר הזה. עד עכשיו קונפליקט
// כזה היה נראה רק בתור הגלובלי (settings/import-conflicts) בלי שום
// רמז על הכרטיס עצמו שהוא בכלל קיים. משתמש שוב ב-resolveImportConflict
// הקיים - בלי לוגיקה כפולה. כפתורי הפתרון מוצגים רק למנהל (isManager) -
// לנציג רגיל מוצגת רשימת-הקונפליקטים בלבד, קריאה-בלבד.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveImportConflict } from '../actions';

const TWIN_ELIGIBLE = new Set(['phone', 'email']);

export default function ImportConflictsBanner({ conflicts, isManager }) {
  const [resolvedIds, setResolvedIds] = useState(() => new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  const visible = conflicts.filter((c) => !resolvedIds.has(c.id));
  if (visible.length === 0) return null;

  function handleResolve(conflictId, resolution) {
    setError(null);
    startTransition(async () => {
      const res = await resolveImportConflict(conflictId, resolution);
      if (res?.error) { setError(res.error); return; }
      setResolvedIds((prev) => new Set(prev).add(conflictId));
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, margin: '16px 0 0' }}>
      <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
        ⚠ {visible.length} קונפליקטים בייבוא ממתינים לבדיקה אצל איש הקשר הזה
      </div>
      {error && <div style={{ color: '#b23b2f', marginBottom: 6 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((c) => (
          <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span>
              <b>{c.field_label}</b> ({c.workspaces?.name}): קיים <span style={{ color: 'var(--text-secondary)' }}>"{c.existing_value}"</span> ← בקובץ <span style={{ color: '#b45309' }}>"{c.new_value}"</span>
            </span>
            {isManager && (
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" disabled={isPending} onClick={() => handleResolve(c.id, 'kept_existing')} style={btnStyle()}>השאר קיים</button>
                <button type="button" disabled={isPending} onClick={() => handleResolve(c.id, 'used_new')} style={btnStyle()}>החלף בחדש</button>
                {TWIN_ELIGIBLE.has(c.field_key) && (
                  <button type="button" disabled={isPending} onClick={() => handleResolve(c.id, 'kept_both')} style={btnStyle()}>שמור את שניהם</button>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle() {
  return {
    background: 'none', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 9px',
    fontSize: 11.5, color: '#92400e', cursor: 'pointer',
  };
}
