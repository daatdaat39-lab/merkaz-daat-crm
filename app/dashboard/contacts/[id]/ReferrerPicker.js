'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchContacts, setReferrer } from '../actions';

// "מתווך / גורם מקשר" - מי הביא את התורם. נשמר ב-extra_fields (בלי
// מיגרציה נפרדת), מוצג ככרטיס קטן ליד קוביית התרומה, רק במחלקת תרומות.
export default function ReferrerPicker({ contactId, department, frozen }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSearch(value) {
    setQuery(value);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, contactId);
      setResults(res);
    });
  }

  function handlePick(referrerId) {
    startTransition(async () => {
      await setReferrer(department.id, referrerId);
      setEditing(false); setQuery(''); setResults([]);
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>🔗 מתווך / גורם מקשר</span>
        {!frozen && (
          <button type="button" onClick={() => setEditing((v) => !v)} style={{ background: 'none', border: 'none', color: '#6b6b6b', cursor: 'pointer', fontSize: 11 }}>
            {editing ? 'ביטול' : department.referrer ? 'שינוי' : '+ הוספה'}
          </button>
        )}
      </div>

      {!editing && (
        department.referrer
          ? <Link href={`/dashboard/contacts/${department.referrer.id}`} style={{ color: '#1f4d3d' }}>{department.referrer.name} →</Link>
          : <span style={{ color: '#9b9b9b' }}>לא הוגדר</span>
      )}

      {editing && (
        <div style={{ position: 'relative', marginTop: 6 }}>
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="חיפוש איש קשר..."
            autoFocus
            style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12.5, boxSizing: 'border-box' }}
          />
          {results.length > 0 && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => handlePick(r.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
                >
                  {r.first} {r.last} <span style={{ color: '#9b9b9b' }}>{r.phone || r.email || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
