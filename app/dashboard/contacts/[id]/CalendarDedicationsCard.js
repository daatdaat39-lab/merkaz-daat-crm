'use client';

// "זכאי ליום בלוח שנה" - רשימת תאריכים+נוסחי הקדשה של איש הקשר, עם
// כפתור + להוספת שורה נוספת. הנוסחים מוגדרים ב-pipelines.js
// (DEDICATION_TEMPLATES) כדי שקל יהיה לשנות אותם בלי לגעת כאן.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEDICATION_TEMPLATES } from '../../components/pipelines';
import { addDedication, removeDedication } from '../actions';

export default function CalendarDedicationsCard({ contactId, dedications = [], frozen }) {
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [template, setTemplate] = useState(DEDICATION_TEMPLATES[0]);
  const [customText, setCustomText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isCustom = template === 'נוסח חופשי';

  function resetForm() {
    setAdding(false); setDate(''); setTemplate(DEDICATION_TEMPLATES[0]); setCustomText(''); setNote(''); setError(null);
  }

  function handleAdd() {
    setError(null);
    const text = isCustom ? customText.trim() : `${template} ${customText}`.trim();
    if (!date || !text) { setError('יש למלא תאריך ונוסח'); return; }
    startTransition(async () => {
      const res = await addDedication(contactId, date, text, note);
      if (res?.error) { setError(res.error); return; }
      resetForm();
      router.refresh();
    });
  }

  function handleRemove(id) {
    startTransition(async () => {
      const res = await removeDedication(id);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>
          📅 זכאי ליום בלוח שנה
        </span>
        {!frozen && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="הוספת תאריך והקדשה"
            style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >+</button>
        )}
      </div>

      {dedications.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: '#9b9b9b' }}>לא הוגדרו תאריכים</div>
      )}

      {dedications.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid #f5f5f5', padding: '6px 0', fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {new Date(d.dedication_date).toLocaleDateString('he-IL')}
          </span>
          <span style={{ flex: 1 }}>
            {d.dedication_text}
            {d.note && <span style={{ color: '#9b9b9b' }}> — {d.note}</span>}
          </span>
          {!frozen && (
            <button
              type="button"
              onClick={() => handleRemove(d.id)}
              disabled={isPending}
              title="הסרה"
              style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 12 }}
            >✕</button>
          )}
        </div>
      ))}

      {adding && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle()} />
          <select value={template} onChange={(e) => setTemplate(e.target.value)} style={fieldStyle()}>
            {DEDICATION_TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={isCustom ? 'נוסח ההקדשה המלא...' : 'שם / המשך הנוסח...'}
            style={fieldStyle()}
          />
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה (אופציונלי)" style={fieldStyle()} />
          {error && <div style={{ color: '#b23b2f', fontSize: 11.5 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={handleAdd} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
              הוספה
            </button>
            <button type="button" onClick={resetForm} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fieldStyle() {
  return { border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
}
