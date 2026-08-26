'use client';

import { useMemo, useState } from 'react';

// בורר "מקור" מרובה-ערכים - אותו רעיון בדיוק כמו TagPicker.js (צ'יפים +
// חיפוש/הוספה מתוך ערכים קיימים), אבל contacts.source נשאר עמודת טקסט
// רגילה (לא מערך אמיתי כמו tags) - כדי לא לגעת בשום קוד אחר שכבר קורא
// אותה (סינון בבניית-קבוצה, ניהול נתונים מרכזי וכו'), הצ'יפים נשמרים
// ל-hidden input כמחרוזת אחת מופרדת-פסיק ("צ'רידי, אורביט") - אותו
// פורמט בדיוק שכבר נוצר היום באופציית "שניהם" במסך מיזוג כפילויות.
export default function SourceMultiPicker({ name = 'source', existingSources = [], defaultValue = '' }) {
  const [selected, setSelected] = useState(() =>
    (defaultValue || '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return existingSources
      .filter((s) => !selected.includes(s))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [existingSources, selected, query]);

  const exactMatch = existingSources.some((s) => s.toLowerCase() === query.trim().toLowerCase());

  function addSource(value) {
    const v = value.trim();
    if (!v || selected.includes(v)) return;
    setSelected((prev) => [...prev, v]);
    setQuery('');
    setOpen(false);
  }

  function removeSource(value) {
    setSelected((prev) => prev.filter((s) => s !== value));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) addSource(query);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={selected.join(', ')} />
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, border: '1px solid #e5e5e5',
        borderRadius: 6, padding: '5px 8px', minHeight: 30, alignItems: 'center',
      }}>
        {selected.map((s) => (
          <span key={s} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0f0f0',
            color: '#333', padding: '2px 6px 2px 4px', borderRadius: 4, fontSize: 12,
          }}>
            {s}
            <button type="button" onClick={() => removeSource(s)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#888', padding: 0, lineHeight: 1,
            }}>
              ✕
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length ? '' : 'הקלד לחיפוש/הוספה...'}
          style={{ flex: 1, minWidth: 80, border: 'none', outline: 'none', fontSize: 12.5 }}
        />
      </div>

      {open && (query.trim() || suggestions.length > 0) && (
        <div style={{
          marginTop: 4, background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', maxHeight: 180, overflowY: 'auto', position: 'absolute', width: '100%', zIndex: 20,
        }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => addSource(s)}
              style={{ display: 'block', width: '100%', textAlign: 'right', padding: '6px 10px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {s}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={() => addSource(query)}
              style={{ display: 'block', width: '100%', textAlign: 'right', padding: '6px 10px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #1f4d3d)', fontWeight: 600 }}
            >
              + הוספת מקור חדש: "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
