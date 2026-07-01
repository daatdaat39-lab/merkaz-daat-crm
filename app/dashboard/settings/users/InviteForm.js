'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteMemberWithPassword } from './actions';

export default function InviteForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [dept, setDept] = useState('');
  const [result, setResult] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await inviteMemberWithPassword({ email, name, role, dept });
      setResult(res);
      if (res.success) {
        setName('');
        setEmail('');
        setRole('member');
        setDept('');
        router.refresh();
      }
    });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 8, background: '#fff', border: '1px solid var(--border)',
        borderRadius: 8, padding: 14, flexWrap: 'wrap',
      }}>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="שם מלא"
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, minWidth: 130 }}
        />
        <input
          value={email} onChange={(e) => setEmail(e.target.value)}
          type="email" required placeholder="אימייל"
          style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
        />
        <select
          value={role} onChange={(e) => setRole(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
        >
          <option value="member">חבר</option>
          <option value="admin">מנהל</option>
          <option value="owner">בעלים</option>
        </select>
        <select
          value={dept} onChange={(e) => setDept(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
        >
          <option value="">ללא מחלקה</option>
          <option value="לימודי">לימודי</option>
          <option value="תרומות">תרומות</option>
          <option value="מנהלה">מנהלה</option>
        </select>
        <button type="submit" disabled={isPending} style={{
          background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 18px', fontSize: 13, cursor: 'pointer',
        }}>
          {isPending ? 'יוצר משתמש...' : 'יצירת משתמש'}
        </button>
      </form>

      {result?.error && (
        <div style={{
          marginTop: 10, background: 'var(--red-bg)', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 16px', fontSize: 12.5, color: '#991b1b',
        }}>
          שגיאה: {result.error}
        </div>
      )}

      {result?.success && result.password && (
        <div style={{
          marginTop: 10, background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8,
          padding: '14px 16px', fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            ✅ המשתמש נוצר! שלח לו את הפרטים האלה (וואטסאפ/מייל/בעל פה):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace', fontSize: 13, background: '#fff', padding: 10, borderRadius: 6, marginBottom: 8 }}>
            <div>אימייל: {result.email}</div>
            <div>סיסמה זמנית: <b>{result.password}</b></div>
          </div>
          <div style={{ fontSize: 11.5, color: '#92400e' }}>
            ⚠️ הסיסמה מוצגת פעם אחת בלבד ולא תישמר — תעתיק אותה עכשיו. המשתמש יוכל להתחבר עם הפרטים האלה ולשנות סיסמה בהמשך.
          </div>
        </div>
      )}

      {result?.success && !result.password && (
        <div style={{
          marginTop: 10, background: 'var(--green-bg)', border: '1px solid #86efac', borderRadius: 8,
          padding: '12px 16px', fontSize: 12.5, color: '#166534',
        }}>
          ✅ המשתמש כבר קיים במערכת — הוא נוסף ל-workspace הזה עם הפרטים הקיימים שלו.
        </div>
      )}
    </div>
  );
}
