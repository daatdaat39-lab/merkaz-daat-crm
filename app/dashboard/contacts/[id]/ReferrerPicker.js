'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchContacts, setReferrer } from '../actions';

// "מתווך / גורם מקשר" - מי הביא את איש הקשר למחלקה הזאת. נשמר ב-
// extra_fields (בלי מיגרציה נפרדת). מוצג כטקסט קטן אפור צמוד לשם איש
// הקשר, זמין לכל מחלקה (לא רק תרומות) - לחיצה פותחת פופ-אובר קטן לחיפוש
// ובחירה של איש הקשר המפנה.
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
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => !frozen && setEditing((v) => !v)}
        disabled={frozen}
        style={{
          background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: 'var(--text-muted)',
          cursor: frozen ? 'default' : 'pointer', textDecoration: department.referrer ? 'underline' : 'none',
          textDecorationStyle: 'dotted',
        }}
      >
        {department.referrer ? `🔗 הופנה ע"י ${department.referrer.name}` : '+ הוספת גורם מקשר'}
      </button>

      {editing && (
        <>
          <div onClick={() => setEditing(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, zIndex: 999,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, width: 240,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: 12.5,
          }}>
            {department.referrer && (
              <div style={{ marginBottom: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                כרגע: <Link href={`/dashboard/contacts/${department.referrer.id}`} style={{ color: 'var(--accent)' }}>{department.referrer.name} →</Link>
              </div>
            )}
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="חיפוש איש קשר..."
              autoFocus
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12.5, boxSizing: 'border-box' }}
            />
            {results.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => handlePick(r.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}
                  >
                    {r.first} {r.last} <span style={{ color: 'var(--text-muted)' }}>{r.phone || r.email || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}
