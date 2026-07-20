'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addWhatsAppTemplate, deleteWhatsAppTemplate } from '../contacts/actions';

// ניהול רשימת תבניות WhatsApp מאושרות - כדי שבחלון השליחה יהיה אפשר
// לבחור בין כמה תבניות, לא רק אחת קבועה.
export default function WhatsAppTemplatesPanel({ templates }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(formData) {
    setError(null);
    startTransition(async () => {
      const res = await addWhatsAppTemplate(formData);
      if (res?.error) { setError(res.error); return; }
      setAdding(false);
      router.refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('להסיר את התבנית הזו מהרשימה?')) return;
    startTransition(async () => {
      await deleteWhatsAppTemplate(id);
      router.refresh();
    });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>תבניות WhatsApp מאושרות</div>
        <button onClick={() => setAdding((v) => !v)} style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' }}>
          {adding ? 'ביטול' : '+ הוספת תבנית'}
        </button>
      </div>

      {adding && (
        <form action={handleAdd} style={{ padding: 16, borderBottom: '1px solid #f2f2f2', display: 'flex', flexDirection: 'column', gap: 8, background: '#f9f9f9' }}>
          {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>שגיאה: {error}</div>}
          <input name="name" placeholder="שם התבנית (לזיהוי בלבד, למשל 'הודעה ראשונה - תרומות')" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <input name="template_id" placeholder="מספר התבנית מ-InforU (Template ID)" required style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13 }} />
          <textarea name="preview_text" placeholder="נוסח התבנית (לתצוגה בלבד, לא נשלח בפועל)" rows={3} style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }} />
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
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name} <span style={{ color: '#9b9b9b', fontWeight: 400 }}>(#{t.template_id})</span></div>
            {t.preview_text && <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 3 }}>{t.preview_text}</div>}
          </div>
          <button onClick={() => handleDelete(t.id)} disabled={isPending} style={{ background: 'none', border: 'none', color: '#b23b2f', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            הסרה
          </button>
        </div>
      ))}
    </div>
  );
}
