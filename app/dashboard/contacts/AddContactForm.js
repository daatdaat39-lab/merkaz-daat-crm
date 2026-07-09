'use client';

import { useState, useTransition } from 'react';
import { createContact } from './actions';

const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 };
const labelStyle = { fontSize: 10.5, color: 'var(--text-secondary)', marginBottom: 3, display: 'block' };

export default function AddContactForm({ label = '+ איש קשר חדש', modalTitle = 'איש קשר חדש' }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function handleSubmit(formData) {
    setError(null);
    startTransition(async () => {
      const res = await createContact(formData);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          background: 'var(--text)', color: '#fff', border: '1px solid var(--text)',
        }}
      >
        {label}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 10, padding: 22, width: 460, maxWidth: '100%' }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{modalTitle}</div>
            <form action={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={labelStyle}>שם פרטי *</span><input name="first" required style={inputStyle} /></div>
              <div><span style={labelStyle}>שם משפחה</span><input name="last" style={inputStyle} /></div>
              <div><span style={labelStyle}>טלפון</span><input name="phone" style={inputStyle} /></div>
              <div><span style={labelStyle}>טלפון נוסף</span><input name="phone2" style={inputStyle} /></div>
              <div><span style={labelStyle}>מייל</span><input name="email" type="email" style={inputStyle} /></div>
              <div><span style={labelStyle}>מקור</span><input name="source" style={inputStyle} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={labelStyle}>תגיות (מופרדות בפסיק)</span>
                <input name="tags" style={inputStyle} />
              </div>
              {error && <div style={{ gridColumn: '1 / -1', color: 'var(--red, #b23b2f)', fontSize: 12 }}>שגיאה: {error}</div>}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" disabled={isPending} style={{
                  background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                }}>
                  {isPending ? 'יוצר...' : 'יצירה'}
                </button>
                <button type="button" onClick={() => setOpen(false)} style={{
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                }}>
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
