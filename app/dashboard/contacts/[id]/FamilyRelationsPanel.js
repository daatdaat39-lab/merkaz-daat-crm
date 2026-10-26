'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addContactRelation, removeContactRelation, searchContacts } from '../actions';

// תצוגה + הוספה-ידנית של קשרים בין אנשי-קשר (contact_relations, many-
// to-many אמיתי - למשל הורה↔תלמיד). יצירה-אוטומטית קורית רק בזמן-ייבוא
// (ר. resolveContactRelation ב-leadIntakeCore.js) - כאן זו ההוספה-
// הידנית-היחידה שקיימת, בכוונה (לא הצעה-אוטומטית-לפי-שם/טלפון, נדחה
// במפורש בדיון-תכנון). forward = "אני מקושר אליו", reverse = "הוא
// מקושר אליי" - שתי כיוונים כי contact_relations שומרת שורה אחת בלבד.
const COMMON_LABELS = ['אב', 'אם', 'בן', 'בת', 'הורה', 'ילד/ה'];

export default function FamilyRelationsPanel({ contactId, relatedContacts = { forward: [], reverse: [] }, frozen = false }) {
  const { forward = [], reverse = [] } = relatedContacts;
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  if (forward.length === 0 && reverse.length === 0 && frozen) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: 'var(--k-text-muted, #9b9b9b)' }}>קשרי משפחה</div>
      {forward.map((r) => r.contact && <RelationRow key={r.id} relation={r} contactId={contactId} frozen={frozen} onRemoved={() => router.refresh()} />)}
      {reverse.map((r) => r.contact && <RelationRow key={r.id} relation={r} contactId={contactId} frozen={frozen} onRemoved={() => router.refresh()} />)}
      {!frozen && (adding ? (
        <AddRelationForm contactId={contactId} onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button
          type="button" onClick={() => setAdding(true)}
          style={{ background: 'none', border: '1px dashed var(--k-border, #e5e5e5)', borderRadius: 4, padding: '2px 8px', fontSize: 11.5, color: 'var(--k-text-muted, #9b9b9b)', cursor: 'pointer', marginTop: 2 }}
        >
          + קישור איש-קשר
        </button>
      ))}
    </div>
  );
}

function RelationRow({ relation, contactId, frozen, onRemoved }) {
  const [isPending, startTransition] = useTransition();
  function handleRemove() {
    startTransition(async () => {
      await removeContactRelation(relation.id, contactId);
      onRemoved();
    });
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <a href={`/dashboard/contacts/${relation.contact.id}`} style={{ display: 'block', fontSize: 13, color: 'var(--k-accent, #1f4d3d)', textDecoration: 'none' }}>
        {relation.label}: {relation.contact.first} {relation.contact.last} →
      </a>
      {!frozen && (
        <button type="button" onClick={handleRemove} disabled={isPending} style={{ background: 'none', border: 'none', color: 'var(--k-danger-text, #b23b2f)', fontSize: 11, cursor: 'pointer' }}>
          הסרה
        </button>
      )}
    </div>
  );
}

function AddRelationForm({ contactId, onDone, onCancel }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [label, setLabel] = useState(COMMON_LABELS[0]);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch(value) {
    setQuery(value);
    setDropdownOpen(true);
    setSelected(null);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, contactId);
      setResults(res);
    });
  }

  function handleSave() {
    if (!selected) { setError('יש לבחור איש-קשר'); return; }
    setError(null);
    startTransition(async () => {
      const res = await addContactRelation(contactId, selected.id, label);
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div style={{ border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, padding: 8, marginTop: 4 }}>
      {error && <div style={{ color: 'var(--k-danger-text, #b23b2f)', fontSize: 11, marginBottom: 4 }}>{error}</div>}
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <input
          value={selected ? `${selected.first} ${selected.last}` : query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          placeholder="חיפוש איש-קשר לקישור..."
          style={{ width: '100%', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 6, padding: '5px 8px', fontSize: 12, boxSizing: 'border-box' }}
        />
        {dropdownOpen && query.trim().length >= 2 && !selected && (
          <div style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, marginTop: 4,
            border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 8, background: 'var(--k-surface, #fff)', maxHeight: 140, overflowY: 'auto',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 60,
          }}>
            {results.length === 0 && <div style={{ padding: '6px 8px', fontSize: 11.5, color: 'var(--k-text-muted, #9b9b9b)' }}>אין תוצאות</div>}
            {results.map((r) => (
              <button
                key={r.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); setSelected(r); setDropdownOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid var(--k-border, #e5e5e5)', padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
              >
                {r.first} {r.last} <span style={{ color: 'var(--k-text-muted, #9b9b9b)' }}>{r.phone || r.email || ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <select value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '100%', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 6, padding: '5px 8px', fontSize: 12, marginBottom: 6 }}>
        {COMMON_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={handleSave} disabled={isPending} style={{ background: 'var(--k-accent, #0a0a0a)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, cursor: 'pointer' }}>
          {isPending ? 'שומר...' : 'קישור'}
        </button>
        <button type="button" onClick={onCancel} style={{ background: 'none', border: '1px solid var(--k-border, #e5e5e5)', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, cursor: 'pointer' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}
