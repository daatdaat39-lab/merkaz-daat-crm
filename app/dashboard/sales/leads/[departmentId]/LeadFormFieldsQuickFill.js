'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadRegistrationAnswer } from './leadChecklistActions';
import { CheckIcon } from '../../../components/icons';

// צ'יפי "להשלמה בשיחה" - נגזר-משדות-הטופס-הדינמיים של הקורס הנבחר
// (course_form_fields, migration 0182) במקום-רשימת-שדות-אנשי-קשר-כללית-
// וקבועה. כותב דרך updateLeadRegistrationAnswer (אותה-פעולה-בדיוק שבה-כבר-
// משתמשים מסך-הרישום-הנפרד והקישור-הציבורי) - כך שמילוי-כאן מופיע-
// אוטומטית כבר-ממולא (עם-אפשרות-לתקן) בשני המסכים ההם. קובץ/חתימה
// מוחרגים - יש-להם UI-ייעודי במסך-הרישום-הנפרד, לא-מתאימים לצ'יפ-מהיר.
// בניגוד ל-FillSection המשותף: שדות-שהושלמו **לא-נעלמים** - מוצגים כשורה
// מסומנת-✓-עם-הערך, לחיצה-עליה פותחת-מחדש לעריכה (כדי שהנציג ימשיך-לראות
// מה-כבר-נאמר-בשיחה, ויוכל-לתקן-בקלות אם-צריך).
// onSaved (אופציונלי): נקרא אחרי שמירת שדה - מסך הליד משתמש בו להצעת "לקחת
// אחריות" (useClaimPrompt).
export default function LeadFormFieldsQuickFill({ departmentId, formFields = [], answers = {}, onSaved }) {
  const [openKey, setOpenKey] = useState(null);
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const simple = formFields.filter((f) => f.type !== 'file' && f.type !== 'signature');
  if (simple.length === 0) return null;

  function isDone(f) {
    const v = answers[f.field_key];
    return v !== undefined && v !== null && v !== '';
  }

  function openField(f) {
    setOpenKey(f.field_key);
    setValue(isDone(f) ? String(answers[f.field_key]) : '');
  }

  function save(field) {
    startTransition(async () => {
      const res = await updateLeadRegistrationAnswer(departmentId, field.field_key, value);
      setOpenKey(null);
      setValue('');
      if (!res?.error) onSaved?.();
      router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--k-border)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--k-text-muted)', marginBottom: 8 }}>
        להשלמה בשיחה
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {simple.map((f) => {
          if (openKey === f.field_key) {
            return (
              <div key={f.field_key} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--k-accent)', borderRadius: 8, padding: '4px 6px 4px 10px', background: 'var(--k-surface)' }}>
                {f.type === 'select' ? (
                  <select
                    autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(f); if (e.key === 'Escape') setOpenKey(null); }}
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, background: 'none', color: 'var(--k-text)', minWidth: 0 }}
                  >
                    <option value="">—</option>
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    autoFocus type={f.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)}
                    placeholder={`הקלדת ${f.label}...`}
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
            );
          }
          if (isDone(f)) {
            return (
              <button
                key={f.field_key} type="button" onClick={() => openField(f)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--k-text)', background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '6px 10px', textAlign: 'right', cursor: 'pointer' }}
              >
                <CheckIcon size={12} style={{ color: 'var(--k-ok-text)', flexShrink: 0 }} />
                <span style={{ color: 'var(--k-text-muted)' }}>{f.label}:</span> {String(answers[f.field_key])}
              </button>
            );
          }
          return (
            <button
              key={f.field_key} type="button" onClick={() => openField(f)}
              style={{ fontSize: 12.5, color: 'var(--k-accent)', background: 'none', border: '1px dashed var(--k-border)', borderRadius: 8, padding: '6px 10px', textAlign: 'right', cursor: 'pointer' }}
            >
              + {f.label}{f.required ? ' *' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
