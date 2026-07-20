'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addEmailTemplate, deleteEmailTemplate } from '../contacts/actions';

// ניהול תבניות מייל מוכנות - נבחרות בחלון שליחת מייל מהכרטיס במקום
// לכתוב כל פעם מאפס.
export default function EmailTemplatesPanel({ templates }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(formData) {
    setError(null);
    startTransition(async () => {
      const res = await addEmailTemplate(formData);
      if (res?.error) { setError(res.error); return; }
      setAdding(false);
      router.refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('להסיר את התבנית הזו?')) return;
    startTransition(async () => {
      await deleteEmailTemplate(id);
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>תבניות מייל</div>
        <button onClick={() => setAdding((v) => !v)} style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' }}>
          {adding ? 'ביטול' : '+ הוספת תבנית'}
        </button>
      </div>

      {adding && (
        <form action={handleAdd} style={{ padding: 16, borderBottom: '1px solid #f2f2f2', display: 'flex', flexDirection: 'column', gap: 8, background: '#f9f9f9' }}>
          {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>שגיאה: {error}</div>}
          <input name="name" placeholder="שם התבנית (לזיהוי בלבד)" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <input name="subject" placeholder="נושא המייל" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <textarea name="body" placeholder="תוכן המייל" rows={5} required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }} />
          <button type="submit" disabled={isPending} style={{ alignSelf: 'flex-start', background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>
            שמירה
          </button>
        </form>
      )}

      {templates.length === 0 && !adding && (
        <div style={{ padding: 16, fontSize: 13, color: '#9b9b9b' }}>אין עדיין תבניות מוגדרות</div>
      )}

      {templates.map((t) => (
        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '12px 18px', borderBottom: '1px solid #f2f2f2' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 3 }}>{t.subject}</div>
          </div>
          <button onClick={() => handleDelete(t.id)} disabled={isPending} style={{ background: 'none', border: 'none', color: '#b23b2f', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            הסרה
          </button>
        </div>
      ))}
    </div>
  );
}
