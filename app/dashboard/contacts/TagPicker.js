'use client';

import { useMemo, useState } from 'react';

// בורר תגיות: צ'יפים לתגיות שנבחרו, + חיפוש/בחירה מתוך תגיות קיימות, + אפשרות
// להוסיף תגית חדשה שלא הייתה קיימת עדיין. שומר ל-hidden input בשם `name`
// (מופרד בפסיקים) כדי להתאים לפורמט שהשרת כבר יודע לפרש.
export default function TagPicker({ name = 'tags', existingTags = [], defaultTags = [] }) {
  const [selected, setSelected] = useState(defaultTags);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return existingTags
      .filter((t) => !selected.includes(t))
      .filter((t) => !q || t.toLowerCase().includes(q))
      .slice(0, 8);
  }, [existingTags, selected, query]);

  const exactMatch = existingTags.some((t) => t.toLowerCase() === query.trim().toLowerCase());

  function addTag(tag) {
    const t = tag.trim();
    if (!t || selected.includes(t)) return;
    setSelected((prev) => [...prev, t]);
    setQuery('');
    setOpen(false);
  }

  function removeTag(tag) {
    setSelected((prev) => prev.filter((t) => t !== tag));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) addTag(query);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={selected.join(',')} />
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, border: '1px solid var(--border, #e5e5e5)',
        borderRadius: 6, padding: '6px 8px', minHeight: 34, alignItems: 'center',
      }}>
        {selected.map((t) => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0f0f0',
            color: '#333', padding: '2px 6px 2px 4px', borderRadius: 4, fontSize: 12,
          }}>
            {t}
            <button type="button" onClick={() => removeTag(t)} style={{
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
          style={{ flex: 1, minWidth: 100, border: 'none', outline: 'none', fontSize: 13 }}
        />
      </div>

      {open && (query.trim() || suggestions.length > 0) && (
        <div style={{
          marginTop: 4, background: '#fff', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', maxHeight: 160, overflowY: 'auto', position: 'relative', zIndex: 20,
        }}>
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={() => addTag(t)}
              style={{
                display: 'block', width: '100%', textAlign: 'right', padding: '6px 10px', fontSize: 12.5,
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={() => addTag(query)}
              style={{
                display: 'block', width: '100%', textAlign: 'right', padding: '6px 10px', fontSize: 12.5,
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #1f4d3d)', fontWeight: 600,
              }}
            >
              + הוספת תגית חדשה: "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
