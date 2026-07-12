'use client';

import { useState } from 'react';

const FIELDS = [
  { key: 'first', label: 'שם פרטי' },
  { key: 'last', label: 'שם משפחה' },
  { key: 'idnum', label: 'ת"ז' },
  { key: 'phone', label: 'טלפון' },
  { key: 'phone2', label: 'טלפון נוסף' },
  { key: 'email', label: 'מייל' },
  { key: 'source', label: 'מקור' },
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

  function pick(key, which) {
    setChoices((prev) => ({ ...prev, [key]: which }));
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
    FIELDS.forEach(({ key }) => {
      resolved[key] = choices[key] === 'new' ? (newValues[key] || '') : (existing[key] || '');
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

      <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>שדה</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>קיים</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>חדש</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(({ key, label }) => {
              const existingVal = existing[key] || '—';
              const newVal = newValues[key] || '—';
              if (existingVal === '—' && newVal === '—') return null;
              return (
                <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px', fontWeight: 500 }}>{label}</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', cursor: 'pointer' }}>
                      <input type="radio" name={`field-${key}`} checked={choices[key] === 'existing'} onChange={() => pick(key, 'existing')} />
                      <span>{existingVal}</span>
                    </label>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', cursor: 'pointer' }}>
                      <input type="radio" name={`field-${key}`} checked={choices[key] === 'new'} onChange={() => pick(key, 'new')} />
                      <span>{newVal}</span>
                    </label>
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
        <button onClick={onCancel} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          חזרה
        </button>
      </div>
    </div>
  );
}
