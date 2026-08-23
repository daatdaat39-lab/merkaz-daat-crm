'use client';

import { useMemo, useState } from 'react';

// בורר תגיות לסינון (לא עריכה) - צ'יפים לתגיות שנבחרו + dropdown חיפוש,
// בהשראת התצוגה של TagPicker.js (../contacts/TagPicker.js) אבל בלי
// "הוספת תגית חדשה" (בפילטר אין טעם ליצור תגית שלא קיימת - תמיד תחזיר
// אפס תוצאות) ובלי hidden input לטופס - value/onChange רגילים.
// value: מערך התגיות הנבחרות. onChange מקבל את המערך המלא בכל שינוי.
// הקורא אחראי לסמנטיקת "או" (c.tags.some(t => value.includes(t))) -
// הרכיב עצמו רק אוסף בחירה, לא מפרש אותה.
export default function TagFilterMultiSelect({ value = [], onChange, tags = [], groups = null, placeholder = 'סינון לפי תגיות...' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const flatTags = groups ? groups.flatMap((g) => g.tags) : tags;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flatTags.filter((t) => !value.includes(t)).filter((t) => !q || t.toLowerCase().includes(q));
  }, [flatTags, value, query]);

  const groupedSuggestions = useMemo(() => {
    if (!groups) return null;
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({ department: g.department, tags: g.tags.filter((t) => !value.includes(t)).filter((t) => !q || t.toLowerCase().includes(q)) }))
      .filter((g) => g.tags.length > 0);
  }, [groups, value, query]);

  function addTag(tag) {
    if (value.includes(tag)) return;
    onChange([...value, tag]);
    setQuery('');
  }

  function removeTag(tag) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div style={{ position: 'relative', minWidth: 200 }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, border: '1px solid var(--border)',
        borderRadius: 6, padding: '5px 8px', minHeight: 32, alignItems: 'center', background: 'var(--bg)',
      }}>
        {value.map((t) => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary, #f0f0f0)',
            color: 'var(--text)', padding: '2px 6px 2px 4px', borderRadius: 4, fontSize: 12,
          }}>
            {t}
            <button type="button" onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>✕</button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value.length ? '' : placeholder}
          style={{ flex: 1, minWidth: 80, border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent' }}
        />
      </div>

      {open && (groupedSuggestions ? groupedSuggestions.length > 0 : suggestions.length > 0) && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          maxHeight: 220, overflowY: 'auto', zIndex: 20, minWidth: 200,
        }}>
          {groupedSuggestions ? groupedSuggestions.map((g) => (
            <div key={g.department || '__general__'}>
              <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {g.department || 'כלליות'}
              </div>
              {g.tags.map((t) => (
                <button key={t} type="button" onMouseDown={() => addTag(t)} style={suggestionBtnStyle()}>{t}</button>
              ))}
            </div>
          )) : suggestions.map((t) => (
            <button key={t} type="button" onMouseDown={() => addTag(t)} style={suggestionBtnStyle()}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function suggestionBtnStyle() {
  return { display: 'block', width: '100%', textAlign: 'right', padding: '6px 10px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer' };
}
