'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateContact, deleteContact, mergeContacts, searchContacts } from '../actions';
import TagPicker from '../TagPicker';

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 };
const labelStyle = { fontSize: 10.5, color: '#9b9b9b', marginBottom: 3, display: 'block' };

export default function ContactEditPanel({ contact, existingTags = [] }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'merge'
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  const boundUpdate = updateContact.bind(null, contact.id);

  function handleDelete() {
    if (!confirm(`למחוק את ${contact.first} ${contact.last}? הפעולה בלתי הפיכה.`)) return;
    startTransition(async () => {
      const res = await deleteContact(contact.id);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setMode(mode === 'edit' ? null : 'edit')} style={btnStyle()}>
          {mode === 'edit' ? 'סגירה' : '✎ עריכת פרטים'}
        </button>
        <button onClick={() => setMode(mode === 'merge' ? null : 'merge')} style={btnStyle()}>
          {mode === 'merge' ? 'סגירה' : '⛙ איחוד עם כפול'}
        </button>
        <button onClick={handleDelete} disabled={isPending} style={{ ...btnStyle(), color: '#b23b2f', borderColor: '#f0d0cc' }}>
          🗑 מחיקה
        </button>
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}

      {mode === 'edit' && (
        <form action={boundUpdate} style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><span style={labelStyle}>שם פרטי</span><input name="first" defaultValue={contact.first || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>שם משפחה</span><input name="last" defaultValue={contact.last || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>טלפון</span><input name="phone" defaultValue={contact.phone || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>טלפון נוסף</span><input name="phone2" defaultValue={contact.phone2 || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>מייל</span><input name="email" type="email" defaultValue={contact.email || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>ת.ז / מזהה</span><input name="idnum" defaultValue={contact.idnum || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>תחום/מחלקה</span><input name="dept" defaultValue={contact.dept || ''} style={inputStyle} /></div>
          <div><span style={labelStyle}>מקור</span><input name="source" defaultValue={contact.source || ''} style={inputStyle} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={labelStyle}>תגיות</span>
            <TagPicker existingTags={existingTags} defaultTags={contact.tags || []} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
              שמירה
            </button>
          </div>
        </form>
      )}

      {mode === 'merge' && <MergePanel contact={contact} onDone={() => router.refresh()} />}
    </div>
  );
}

function MergePanel({ contact }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function handleSearch(value) {
    setQuery(value);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, contact.id);
      setResults(res);
    });
  }

  function handleMerge(otherId, otherName) {
    if (!confirm(`לאחד את "${otherName}" לתוך "${contact.first} ${contact.last}"? הפגישות/משימות של "${otherName}" יעברו לכאן, ו"${otherName}" יימחק.`)) return;
    startTransition(async () => {
      const res = await mergeContacts(contact.id, otherId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, color: '#6b6b6b', margin: '0 0 8px' }}>
        חפש איש קשר כפול לפי שם, טלפון או מייל. איחוד יעביר את כל הפגישות והמשימות שלו לכאן, ואז ימחק אותו.
      </p>
      <input
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="חיפוש..."
        style={inputStyle}
      />
      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {results.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 }}>
            <span>{r.first} {r.last} <span style={{ color: '#9b9b9b' }}>{r.phone || r.email || ''}</span></span>
            <button
              onClick={() => handleMerge(r.id, `${r.first} ${r.last}`)}
              disabled={isPending}
              style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
            >
              איחוד לכאן
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle() {
  return {
    background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6,
    padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', color: '#0a0a0a',
  };
}
