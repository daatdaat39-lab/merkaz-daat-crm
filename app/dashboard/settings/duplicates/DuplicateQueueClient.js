'use client';

// טבלת-סקירה של מועמדי כפילות, 30 בכל עמוד - לכל שורה שני כפתורי פעולה:
// "מיזוג מהיר" (בלי לפתוח חלון - משתמש בברירת המחדל של MergeFieldsPicker:
// ערך חדש אם קיים, אחרת קיים, תגיות מאוחדות) ו-"מיזוג עם בחירה" (פותח את
// אותו MergeFieldsPicker כמו קודם, לזוגות שדורשים החלטה ידנית שדה-שדה).
// הוחלף מה"תור" הקודם (כרטיס אחד בכל פעם) לפי בקשת המשתמש - עברו לו
// יותר מדי זמן בפתיחת חלון-אחר-חלון.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mergeContacts, dismissDuplicatePair } from '../../contacts/actions';
import MergeFieldsPicker from '../../contacts/MergeFieldsPicker';
import { richnessScore } from '../../lib/findDuplicates';

const PAGE_SIZE = 30;

const QUICK_FIELDS = [
  { key: 'first' }, { key: 'last' }, { key: 'idnum' },
  { key: 'phone' }, { key: 'phone2' }, { key: 'email' }, { key: 'email2' },
  { key: 'source' }, { key: 'dept' },
];

// אותה ברירת מחדל בדיוק כמו ה-state ההתחלתי ב-MergeFieldsPicker: ערך חדש
// (של הכרטיס שיימחק) אם יש כזה, אחרת הערך הקיים. תגיות - איחוד של שניהם.
function computeDefaultResolvedFields(existing, dup) {
  const resolved = {};
  QUICK_FIELDS.forEach(({ key }) => {
    const hasNew = !!(dup[key] || '').trim();
    resolved[key] = hasNew ? dup[key] : (existing[key] || '');
  });
  resolved.tags = Array.from(new Set([...(existing.tags || []), ...(dup.tags || [])]));
  return resolved;
}

function pairKey(candidate) {
  return `${candidate.contactA.id}_${candidate.contactB.id}`;
}

function MiniContact({ contact, roleLabel }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{roleLabel}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{contact.first} {contact.last}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {contact.idnum && <div>ת&quot;ז: {contact.idnum}</div>}
        {contact.phone && <div>{contact.phone}</div>}
        {contact.email && <div style={{ wordBreak: 'break-all' }}>{contact.email}</div>}
        {(contact.tags || []).length > 0 && <div>🏷 {(contact.tags || []).join(', ')}</div>}
        {(contact.departments || []).length > 0 && <div>{(contact.departments || []).map((d) => d.workspaceName).join(', ')}</div>}
      </div>
      {(contact.transactionsCount > 0 || contact.commitmentsCount > 0) && (
        <div style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 6px', marginTop: 4, display: 'inline-block' }}>
          💰 {contact.transactionsCount}/{contact.commitmentsCount}
        </div>
      )}
    </div>
  );
}

export default function DuplicateQueueClient({ initialCandidates }) {
  const [queue, setQueue] = useState(initialCandidates);
  const [page, setPage] = useState(0);
  const [swappedKeys, setSwappedKeys] = useState(() => new Set());
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const [pickerFor, setPickerFor] = useState(null); // candidate whose modal is open
  const [, startTransition] = useTransition();
  const router = useRouter();

  const totalPages = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageItems = queue.slice(pageStart, pageStart + PAGE_SIZE);

  function sidesFor(candidate) {
    const key = pairKey(candidate);
    const defaultSwap = richnessScore(candidate.contactB) > richnessScore(candidate.contactA);
    const swapped = swappedKeys.has(key) ? !defaultSwap : defaultSwap;
    return swapped
      ? { existing: candidate.contactB, dup: candidate.contactA }
      : { existing: candidate.contactA, dup: candidate.contactB };
  }

  function toggleSwap(candidate) {
    const key = pairKey(candidate);
    setSwappedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function removeFromQueue(candidate) {
    const key = pairKey(candidate);
    setQueue((prev) => prev.filter((c) => pairKey(c) !== key));
  }

  function setPending(key, on) {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }

  function setRowError(key, message) {
    setErrors((prev) => ({ ...prev, [key]: message }));
  }

  function quickMerge(candidate) {
    const key = pairKey(candidate);
    const { existing, dup } = sidesFor(candidate);
    const resolvedFields = computeDefaultResolvedFields(existing, dup);
    setPending(key, true);
    startTransition(async () => {
      const res = await mergeContacts(existing.id, dup.id, resolvedFields);
      setPending(key, false);
      if (res?.error) { setRowError(key, res.error); return; }
      router.refresh();
      removeFromQueue(candidate);
    });
  }

  function confirmPickerMerge(resolvedFields) {
    const candidate = pickerFor;
    if (!candidate) return;
    const key = pairKey(candidate);
    const { existing, dup } = sidesFor(candidate);
    setPending(key, true);
    startTransition(async () => {
      const res = await mergeContacts(existing.id, dup.id, resolvedFields);
      setPending(key, false);
      if (res?.error) { setRowError(key, res.error); return; }
      router.refresh();
      setPickerFor(null);
      removeFromQueue(candidate);
    });
  }

  function dismiss(candidate) {
    const key = pairKey(candidate);
    setPending(key, true);
    startTransition(async () => {
      const res = await dismissDuplicatePair(candidate.contactA.id, candidate.contactB.id);
      setPending(key, false);
      if (res?.error) { setRowError(key, res.error); return; }
      router.refresh();
      removeFromQueue(candidate);
    });
  }

  if (queue.length === 0) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '24px', textAlign: 'center', fontSize: 14, color: '#15803d' }}>
        🎉 אין עוד זוגות חשודים
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {queue.length} זוגות ממתינים — עמוד {page + 1} מתוך {totalPages} (עד {PAGE_SIZE} בעמוד)
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={navBtn()}>← הקודם</button>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={navBtn()}>הבא →</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #f7f7f7)' }}>
              <th style={th()}>התאמה</th>
              <th style={th()}>יישאר</th>
              <th style={{ ...th(), width: 34 }}></th>
              <th style={th()}>יימחק</th>
              <th style={th()}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((candidate) => {
              const key = pairKey(candidate);
              const { existing, dup } = sidesFor(candidate);
              const isPending = pendingKeys.has(key);
              const hasMoney = (existing.transactionsCount > 0 || existing.commitmentsCount > 0 || dup.transactionsCount > 0 || dup.commitmentsCount > 0);
              return (
                <tr key={key} style={{ borderTop: '1px solid var(--border)', opacity: isPending ? 0.5 : 1 }}>
                  <td style={td()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {candidate.matchedOn.map((reason) => (
                        <span key={reason} style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                          {reason}
                        </span>
                      ))}
                      {hasMoney && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#b23b2f', whiteSpace: 'nowrap' }}>⚠ יש כסף - בדקו</span>
                      )}
                    </div>
                  </td>
                  <td style={td()}><MiniContact contact={existing} roleLabel="יישאר" /></td>
                  <td style={td()}>
                    <button type="button" onClick={() => toggleSwap(candidate)} title="החלף צדדים" disabled={isPending} style={{ ...navBtn(), padding: '4px 6px' }}>🔄</button>
                  </td>
                  <td style={td()}><MiniContact contact={dup} roleLabel="יימחק" /></td>
                  <td style={td()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                      <button type="button" onClick={() => quickMerge(candidate)} disabled={isPending} style={primaryBtn()}>🔗 מיזוג מהיר</button>
                      <button type="button" onClick={() => setPickerFor(candidate)} disabled={isPending} style={ghostBtn()}>מיזוג עם בחירה</button>
                      <button type="button" onClick={() => dismiss(candidate)} disabled={isPending} style={ghostBtn()}>✕ לא כפילות</button>
                      {errors[key] && <div style={{ color: '#b23b2f', fontSize: 10.5 }}>{errors[key]}</div>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pickerFor && (() => {
        const { existing, dup } = sidesFor(pickerFor);
        return (
          <div
            onClick={() => setPickerFor(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 10, padding: 22, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <MergeFieldsPicker existing={existing} newValues={dup} onConfirm={confirmPickerMerge} onCancel={() => setPickerFor(null)} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function th() {
  return { textAlign: 'right', padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 };
}

function td() {
  return { padding: '8px 10px', verticalAlign: 'top' };
}

function navBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
    borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}

function primaryBtn() {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    background: 'var(--text, #0a0a0a)', color: '#fff', border: 'none', whiteSpace: 'nowrap',
  };
}

function ghostBtn() {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', whiteSpace: 'nowrap',
  };
}
