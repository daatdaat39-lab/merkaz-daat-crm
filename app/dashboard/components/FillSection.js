'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateContactField } from '../contacts/actions';
import { CheckIcon } from './icons';

// צ'יפי "להשלמה בשיחה" - שדות-אישיים חסרים שנציג עשוי לרצות למלא
// תוך-כדי שיחה בלי לעזוב את מסך-הטיפול: כפתור-קטן → שדה-קלט יחיד → ✓
// לשמירה. כל שדה בנפרד, לא טופס מרוכז (ר' תוכנית עיצוב-מחדש - "פחות
// לכתוב"). fields: [{ key, label, type?, placeholder? }] - key חייב
// להיות ב-EDITABLE_FIELDS (ר' lib/contactFieldsList.js).
export default function FillSection({ contactId, fields }) {
  const [openKey, setOpenKey] = useState(null);
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const missing = fields.filter((f) => !f.currentValue);
  if (missing.length === 0) return null;

  function save(field) {
    startTransition(async () => {
      await updateContactField(contactId, field.key, value);
      setOpenKey(null);
      setValue('');
      router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--k-border)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--k-text-muted)', marginBottom: 8 }}>
        להשלמה בשיחה
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {missing.map((f) => (
          openKey === f.key ? (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--k-accent)', borderRadius: 8, padding: '4px 6px 4px 10px', background: 'var(--k-surface)' }}>
              {f.type === 'select' ? (
                <select
                  autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(f); if (e.key === 'Escape') setOpenKey(null); }}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, background: 'none', color: 'var(--k-text)', minWidth: 0 }}
                >
                  <option value="">—</option>
                  {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  autoFocus type={f.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder={f.placeholder || `הקלדת ${f.label}...`}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(f); if (e.key === 'Escape') setOpenKey(null); }}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, background: 'none', color: 'var(--k-text)', minWidth: 0 }}
                />
              )}
              <button
                type="button" onClick={() => save(f)} disabled={isPending}
                style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--k-accent)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <CheckIcon size={12} style={{ color: '#fff' }} />
              </button>
            </div>
          ) : (
            <button
              key={f.key} type="button" onClick={() => { setOpenKey(f.key); setValue(''); }}
              style={{ fontSize: 12.5, color: 'var(--k-accent)', background: 'none', border: '1px dashed var(--k-border)', borderRadius: 8, padding: '6px 10px', textAlign: 'right', cursor: 'pointer' }}
            >
              + {f.label}
            </button>
          )
        ))}
      </div>
    </div>
  );
}
