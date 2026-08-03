'use client';

// "זכאי ליום בלוח שנה" - רשימת תאריכים+נוסחי הקדשה של איש הקשר, עם
// כפתור + להוספת שורה נוספת. תומך בהקדשה משפחתית (כמה שמות תחת אותה
// הקדשה, למשל "לזכות משפחת כהן"). הנוסחים מוגדרים ב-pipelines.js
// (DEDICATION_TEMPLATES). ברגע שהופקה גרסת הדפסה (DedicationsWidget)
// ההקדשה ננעלת - הסרה דורשת owner/admin (ר' actions.js).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEDICATION_TEMPLATES, CALENDAR_ELIGIBLE_TAG } from '../../components/pipelines';
import { addDedication, removeDedication, unlockDedication } from '../actions';

export default function CalendarDedicationsCard({ contactId, dedications = [], frozen, tags = [], isManager }) {
  const eligible = tags.includes(CALENDAR_ELIGIBLE_TAG);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [template, setTemplate] = useState(DEDICATION_TEMPLATES[0]);
  const [customText, setCustomText] = useState('');
  const [note, setNote] = useState('');
  const [names, setNames] = useState(['']);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isCustom = template === 'נוסח חופשי';

  function resetForm() {
    setAdding(false); setDate(''); setTemplate(DEDICATION_TEMPLATES[0]); setCustomText(''); setNote(''); setNames(['']); setError(null);
  }

  function handleAdd() {
    setError(null);
    const text = isCustom ? customText.trim() : `${template} ${customText}`.trim();
    if (!date || !text) { setError('יש למלא תאריך ונוסח'); return; }
    startTransition(async () => {
      const res = await addDedication(contactId, date, text, note, names);
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

  function handleUnlock(id) {
    startTransition(async () => {
      const res = await unlockDedication(id);
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
        {!frozen && !adding && eligible && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="הוספת תאריך והקדשה"
            style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >+</button>
        )}
      </div>

      {!eligible && (
        <div style={{ fontSize: 11.5, color: '#9b9b9b', marginBottom: dedications.length ? 8 : 0 }}>
          איש קשר זה אינו מתויג "{CALENDAR_ELIGIBLE_TAG}" - הוספת תגית זו (בכרטיס האישי, או בכמות דרך קמפיין) תאפשר הוספת תאריכים.
        </div>
      )}

      {error && <div style={{ color: '#b23b2f', fontSize: 11.5, marginBottom: 8 }}>{error}</div>}

      {dedications.length === 0 && !adding && eligible && (
        <div style={{ fontSize: 12, color: '#9b9b9b' }}>לא הוגדרו תאריכים</div>
      )}

      {dedications.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid #f5f5f5', padding: '6px 0', fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {new Date(d.dedication_date).toLocaleDateString('he-IL')}
          </span>
          <span style={{ flex: 1 }}>
            {d.dedication_text}
            {(d.names || []).length > 0 && <span> — {d.names.join(', ')}</span>}
            {d.note && <span style={{ color: '#9b9b9b' }}> · {d.note}</span>}
            {d.locked_at && (
              <span style={{ marginInlineStart: 6, fontSize: 10.5, color: '#a4691f', background: '#f6ead9', borderRadius: 4, padding: '1px 6px' }}>
                🔒 נעול להדפסה
              </span>
            )}
          </span>
          {!frozen && !d.locked_at && (
            <button type="button" onClick={() => handleRemove(d.id)} disabled={isPending} title="הסרה"
              style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 12 }}
            >✕</button>
          )}
          {!frozen && d.locked_at && isManager && (
            <button type="button" onClick={() => handleUnlock(d.id)} disabled={isPending} title="שחרור נעילה"
              style={{ background: 'none', border: 'none', color: '#a4691f', cursor: 'pointer', fontSize: 11 }}
            >🔓 שחרור</button>
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
          <div style={{ fontSize: 11, color: '#9b9b9b' }}>שמות נוספים תחת אותה הקדשה (הקדשה משפחתית, אופציונלי):</div>
          {names.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={n}
                onChange={(e) => setNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder="שם נוסף..."
                style={{ ...fieldStyle(), flex: 1 }}
              />
              {names.length > 1 && (
                <button type="button" onClick={() => setNames((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setNames((prev) => [...prev, ''])} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #d0d0d0', borderRadius: 4, padding: '2px 8px', fontSize: 11.5, color: '#666', cursor: 'pointer' }}>
            + הוספת שם
          </button>
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
