'use client';

import { useState } from 'react';

const FIELDS = [
  { key: 'first', label: 'שם פרטי', customEditable: true },
  { key: 'last', label: 'שם משפחה', customEditable: true },
  { key: 'idnum', label: 'ת"ז' },
  { key: 'phone', label: 'טלפון', dual: 'phone2' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'email', label: 'מייל', dual: 'email2' },
  { key: 'email2', label: 'מייל נוסף' },
  { key: 'source', label: 'מקור', combinable: true },
  { key: 'dept', label: 'תחום/מחלקה' },
];

// משווה בין איש קשר קיים לבין הערכים החדשים שהוקלדו, ונותן למשתמש לבחור
// שדה-שדה מה להשאיר. ברירת מחדל: הערך החדש אם יש כזה, אחרת הקיים.
export default function MergeFieldsPicker({ existing, newValues, onConfirm, onCancel }) {
  const [choices, setChoices] = useState(() => {
    const initial = {};
    FIELDS.forEach(({ key }) => {
      const hasNew = !!(newValues[key] || '').trim();
      initial[key] = hasNew ? 'new' : 'existing';
    });
    return initial;
  });

  const allTags = Array.from(new Set([...(existing.tags || []), ...(newValues.tags || [])]));
  const [tagsSelected, setTagsSelected] = useState(() => new Set(allTags));

  // ערכי-עריכה חופשית (כרגע רק שם פרטי/משפחה, ר' customEditable) - נועד
  // לזוגות שבהם אף אחד מהערכים הגולמיים לא נכון בדיוק (למשל "ערד מושקא"
  // בשם פרטי אחד ו-"מושקא"/"ערד" מפוצלים נכון אצל השני) - מאפשר להקליד
  // את הצירוף הנכון במקום להיות כבול לבחירה בין שני ערכים לא-מושלמים.
  const [customValues, setCustomValues] = useState({});

  function pick(key, which) {
    setChoices((prev) => ({ ...prev, [key]: which }));
  }

  function setCustom(key, value) {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
    setChoices((prev) => ({ ...prev, [key]: 'custom' }));
  }

  function toggleTag(tag) {
    setTagsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  function handleConfirm() {
    const resolved = {};
    FIELDS.forEach(({ key, dual, combinable }) => {
      if (choices[key] === 'custom') {
        resolved[key] = (customValues[key] || '').trim();
      } else if (choices[key] === 'both' && dual) {
        resolved[key] = existing[key] || '';
        resolved[dual] = newValues[key] || '';
      } else if (choices[key] === 'both' && combinable) {
        // אין "עמודה שנייה" לשדות כמו מקור (בשונה מטלפון/מייל עם dual) -
        // "שניהם" כאן פירושו למזג את שני הערכים למחרוזת אחת מופרדת-פסיק,
        // כדי לא לאבד מידע על שני המקורות שהאדם הגיע מהם.
        const parts = Array.from(new Set([existing[key], newValues[key]].map((v) => (v || '').trim()).filter(Boolean)));
        resolved[key] = parts.join(', ');
      } else {
        resolved[key] = choices[key] === 'new' ? (newValues[key] || '') : (existing[key] || '');
      }
    });
    resolved.tags = Array.from(tagsSelected);
    onConfirm(resolved);
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>בחירת פרטים למיזוג</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        לכל שדה בחר איזה ערך להשאיר — הקיים במערכת, או החדש שהקלדת.
      </p>

      <div style={{ maxHeight: '55vh', overflowY: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 12 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '29%' }} />
            <col style={{ width: '29%' }} />
            <col style={{ width: '28%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>שדה</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>קיים</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>חדש</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}></th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(({ key, label, dual, customEditable, combinable }) => {
              const existingVal = existing[key] || '—';
              const newVal = newValues[key] || '—';
              if (existingVal === '—' && newVal === '—') return null;
              const showBoth = (dual || combinable) && existingVal !== '—' && newVal !== '—' && existingVal !== newVal;
              return (
                <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px', fontWeight: 500, wordBreak: 'break-word' }}>{label}</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 4, justifyContent: 'center', cursor: 'pointer' }}>
                      <input type="radio" name={`field-${key}`} checked={choices[key] === 'existing'} onChange={() => pick(key, 'existing')} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{existingVal}</span>
                    </label>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 4, justifyContent: 'center', cursor: 'pointer' }}>
                      <input type="radio" name={`field-${key}`} checked={choices[key] === 'new'} onChange={() => pick(key, 'new')} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{newVal}</span>
                    </label>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    {showBoth && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', cursor: 'pointer', marginBottom: customEditable ? 4 : 0 }}>
                        <input type="radio" name={`field-${key}`} checked={choices[key] === 'both'} onChange={() => pick(key, 'both')} style={{ flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>שניהם</span>
                      </label>
                    )}
                    {customEditable && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', cursor: 'pointer', minWidth: 0 }}>
                        <input type="radio" name={`field-${key}`} checked={choices[key] === 'custom'} onChange={() => pick(key, 'custom')} style={{ flexShrink: 0 }} />
                        <input
                          value={customValues[key] ?? ''}
                          onChange={(e) => setCustom(key, e.target.value)}
                          placeholder="ערך אחר..."
                          style={{ width: '100%', minWidth: 0, border: '1px solid var(--border, #e5e5e5)', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
                        />
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {allTags.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>תגיות (הכל מסומן לשמירה כברירת מחדל, אפשר לבטל)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.map((t) => (
                <label key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer',
                  background: tagsSelected.has(t) ? '#eef6ee' : '#f2f2f2', border: '1px solid var(--border, #e5e5e5)',
                  borderRadius: 4, padding: '3px 8px',
                }}>
                  <input type="checkbox" checked={tagsSelected.has(t)} onChange={() => toggleTag(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleConfirm} style={{ flex: 1, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          מיזוג
        </button>
        <button onClick={onCancel} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          חזרה
        </button>
      </div>
    </div>
  );
}
