'use client';

// טבלת-סקירה של מועמדי כפילות, 30 בכל עמוד - עריכת השדות המתנגשים קורית
// ישירות בתוך השורה (צ'יפים לבחירה בין הערך הקיים/החדש/שניהם/ערך אחר),
// בלי לפתוח שום חלון - לחיצה על "🔗 מיזוג" מבצעת מייד לפי הבחירות בשורה.
// שדות שלא מתנגשים (רק צד אחד מלא, או שני הצדדים זהים) מוצגים כטקסט
// רגיל בלי צורך בבחירה. הוחלף מה"תור" הקודם (כרטיס אחד בכל פעם, ואז
// חלון-בחירה נפרד) לפי בקשת המשתמש.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mergeContacts, dismissDuplicatePair } from '../../contacts/actions';
import { richnessScore } from '../../lib/findDuplicates';

const PAGE_SIZE = 30;

const FIELD_DEFS = [
  { key: 'first', label: 'שם פרטי', customEditable: true },
  { key: 'last', label: 'שם משפחה', customEditable: true },
  { key: 'idnum', label: 'ת"ז' },
  { key: 'phone', label: 'טלפון', dual: 'phone2' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'email', label: 'מייל', dual: 'email2' },
  { key: 'email2', label: 'מייל נוסף' },
  { key: 'source', label: 'מקור', combinable: true },
  { key: 'dept', label: 'תחום' },
];

function pairKey(candidate) {
  return `${candidate.contactA.id}_${candidate.contactB.id}`;
}

// ברירת מחדל לכל שדה (בלי בחירה מפורשת של המשתמש): ערך חדש אם קיים,
// אחרת קיים - בדיוק כמו ברירת המחדל הקודמת של MergeFieldsPicker.
function defaultChoice(existingVal, newVal) {
  return (newVal || '').trim() ? 'new' : 'existing';
}

function resolveRowFields(existing, dup, choices, customValues) {
  const resolved = {};
  FIELD_DEFS.forEach(({ key, dual, combinable }) => {
    const existingVal = existing[key] || '';
    const newVal = dup[key] || '';
    const choice = choices[key] || defaultChoice(existingVal, newVal);
    if (choice === 'custom') {
      resolved[key] = (customValues[key] || '').trim();
    } else if (choice === 'both' && dual) {
      resolved[key] = existingVal;
      resolved[dual] = newVal;
    } else if (choice === 'both' && combinable) {
      resolved[key] = Array.from(new Set([existingVal, newVal].map((v) => v.trim()).filter(Boolean))).join(', ');
    } else {
      resolved[key] = choice === 'new' ? newVal : existingVal;
    }
  });
  resolved.tags = Array.from(new Set([...(existing.tags || []), ...(dup.tags || [])]));
  return resolved;
}

function Chip({ selected, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        fontSize: 10.5, padding: '2px 7px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
        border: selected ? '1px solid #0a0a0a' : '1px solid var(--border)',
        background: selected ? 'var(--text, #0a0a0a)' : 'var(--bg)',
        color: selected ? '#fff' : 'var(--text-secondary)',
        maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {children}
    </button>
  );
}

// שורת שדה אחת בתוך תא ההשוואה: אם אין התנגשות (רק צד אחד מלא, או זהים) -
// טקסט פשוט. אם יש התנגשות אמיתית - צ'יפים לבחירה, כולל "שניהם"/"ערך אחר"
// כשרלוונטי לשדה.
function FieldRow({ def, existing, dup, choice, customValue, onChoose, onCustom }) {
  const existingVal = (existing[def.key] || '').trim();
  const newVal = (dup[def.key] || '').trim();
  if (!existingVal && !newVal) return null;

  const conflict = existingVal && newVal && existingVal !== newVal;
  const resolvedChoice = choice || defaultChoice(existingVal, newVal);

  if (!conflict) {
    return (
      <div style={{ fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{def.label}: </span>
        <span>{existingVal || newVal}</span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{def.label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Chip selected={resolvedChoice === 'existing'} onClick={() => onChoose('existing')} title="השאר את הערך הקיים">{existingVal}</Chip>
        <Chip selected={resolvedChoice === 'new'} onClick={() => onChoose('new')} title="קח את הערך החדש">{newVal}</Chip>
        {(def.dual || def.combinable) && (
          <Chip selected={resolvedChoice === 'both'} onClick={() => onChoose('both')} title={def.dual ? `קיים ב${def.label}, חדש ב${def.dual === 'phone2' ? 'טלפון נוסף' : 'מייל נוסף'}` : 'משלב את שני הערכים למחרוזת אחת'}>שניהם</Chip>
        )}
        {def.customEditable && (
          <input
            value={resolvedChoice === 'custom' ? customValue : ''}
            onChange={(e) => onCustom(e.target.value)}
            placeholder="ערך אחר…"
            style={{ width: 90, fontSize: 10.5, border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px' }}
          />
        )}
      </div>
    </div>
  );
}

function ContactMeta({ contact, roleLabel }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
      <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>{roleLabel}</div>
      {(contact.departments || []).length > 0 && <div>{(contact.departments || []).map((d) => d.workspaceName).join(', ')}</div>}
      {(contact.transactionsCount > 0 || contact.commitmentsCount > 0) && (
        <div style={{ fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>
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
  const [rowChoices, setRowChoices] = useState({}); // { [pairKey]: { [field]: choice } }
  const [rowCustoms, setRowCustoms] = useState({}); // { [pairKey]: { [field]: text } }
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

  function chooseField(candidate, fieldKey, value) {
    const key = pairKey(candidate);
    setRowChoices((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [fieldKey]: value } }));
  }

  function customField(candidate, fieldKey, text) {
    const key = pairKey(candidate);
    setRowCustoms((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [fieldKey]: text } }));
    setRowChoices((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [fieldKey]: 'custom' } }));
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

  function doMerge(candidate) {
    const key = pairKey(candidate);
    const { existing, dup } = sidesFor(candidate);
    const resolvedFields = resolveRowFields(existing, dup, rowChoices[key] || {}, rowCustoms[key] || {});
    setPending(key, true);
    startTransition(async () => {
      const res = await mergeContacts(existing.id, dup.id, resolvedFields);
      setPending(key, false);
      if (res?.error) { setErrors((prev) => ({ ...prev, [key]: res.error })); return; }
      router.refresh();
      removeFromQueue(candidate);
    });
  }

  function dismiss(candidate) {
    const key = pairKey(candidate);
    setPending(key, true);
    startTransition(async () => {
      const res = await dismissDuplicatePair(candidate.contactA.id, candidate.contactB.id);
      setPending(key, false);
      if (res?.error) { setErrors((prev) => ({ ...prev, [key]: res.error })); return; }
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
              <th style={{ ...th(), width: 34 }}></th>
              <th style={th()}>השוואת שדות (לחצו לבחור)</th>
              <th style={th()}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((candidate) => {
              const key = pairKey(candidate);
              const { existing, dup } = sidesFor(candidate);
              const isPending = pendingKeys.has(key);
              const hasMoney = (existing.transactionsCount > 0 || existing.commitmentsCount > 0 || dup.transactionsCount > 0 || dup.commitmentsCount > 0);
              const choices = rowChoices[key] || {};
              const customs = rowCustoms[key] || {};
              return (
                <tr key={key} style={{ borderTop: '1px solid var(--border)', opacity: isPending ? 0.5 : 1 }}>
                  <td style={td()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {candidate.matchedOn.map((reason) => (
                        <span key={reason} style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                          {reason}
                        </span>
                      ))}
                      {hasMoney && <span style={{ fontSize: 10, fontWeight: 600, color: '#b23b2f', whiteSpace: 'nowrap' }}>⚠ יש כסף - בדקו</span>}
                    </div>
                  </td>
                  <td style={td()}>
                    <button type="button" onClick={() => toggleSwap(candidate)} title="החלף מי יישאר ומי יימחק" disabled={isPending} style={{ ...navBtn(), padding: '4px 6px' }}>🔄</button>
                  </td>
                  <td style={{ ...td(), minWidth: 340 }}>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
                      <ContactMeta contact={existing} roleLabel="יישאר" />
                      <ContactMeta contact={dup} roleLabel="יימחק" />
                    </div>
                    {FIELD_DEFS.map((def) => (
                      <FieldRow
                        key={def.key}
                        def={def}
                        existing={existing}
                        dup={dup}
                        choice={choices[def.key]}
                        customValue={customs[def.key] || ''}
                        onChoose={(value) => chooseField(candidate, def.key, value)}
                        onCustom={(text) => customField(candidate, def.key, text)}
                      />
                    ))}
                  </td>
                  <td style={td()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
                      <button type="button" onClick={() => doMerge(candidate)} disabled={isPending} style={primaryBtn()}>🔗 מיזוג</button>
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
