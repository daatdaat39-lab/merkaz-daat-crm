'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addLineRouting, removeLineRouting } from './actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 13 };

export default function CtiRoutingClient({ routings, workspaces }) {
  const [adding, setAdding] = useState(false);
  const [dnumber, setDnumber] = useState('');
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || '');
  const [label, setLabel] = useState('');
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await addLineRouting({ dnumber, workspaceId, label });
      if (res?.error) { setError(res.error); return; }
      setDnumber(''); setLabel(''); setAdding(false);
      router.refresh();
    });
  }

  function handleRemove(id) {
    startTransition(async () => {
      const res = await removeLineRouting(id);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

      {routings.length === 0 && !adding && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>אין עדיין ניתוב מוגדר - התראות-שיחה לא יישלחו לאף מחלקה.</div>
      )}

      {routings.map((r) => (
        <div key={r.id} style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }} dir="ltr">{r.dnumber}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.workspaces?.name || 'מחלקה'}{r.label ? ` · ${r.label}` : ''}</div>
          </div>
          <button type="button" onClick={() => handleRemove(r.id)} disabled={isPending} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      ))}

      {adding ? (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={dnumber} onChange={(e) => setDnumber(e.target.value)} placeholder="מספר-קו (dnumber)..." dir="ltr" style={inputStyle} />
          <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={inputStyle}>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="תווית (אופציונלי, לדוג׳ 'קו מכירות')" style={inputStyle} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setAdding(false)} style={{ ...inputStyle, cursor: 'pointer' }}>ביטול</button>
            <button type="button" onClick={handleAdd} disabled={isPending || !dnumber.trim() || !workspaceId} style={{ background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}>
              שמירה
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ ...inputStyle, cursor: 'pointer', alignSelf: 'flex-start' }}>
          + הוספת ניתוב
        </button>
      )}
    </div>
  );
}
