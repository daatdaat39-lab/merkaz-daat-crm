'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeMemberRole, removeMemberFromWorkspace, resetMemberPassword, updateMemberDept } from './actions';

export default function MemberRow({ userId, name, role, dept, isSelf }) {
  const [isPending, startTransition] = useTransition();
  const [resetResult, setResetResult] = useState(null);
  const router = useRouter();

  function handleRoleChange(e) {
    const newRole = e.target.value;
    startTransition(async () => {
      await changeMemberRole(userId, newRole);
      router.refresh();
    });
  }

  function handleDeptChange(e) {
    const newDept = e.target.value;
    startTransition(async () => {
      await updateMemberDept(userId, newDept);
      router.refresh();
    });
  }

  function handleRemove() {
    if (!confirm(`להסיר את ${name} מה-workspace?`)) return;
    startTransition(async () => {
      await removeMemberFromWorkspace(userId);
      router.refresh();
    });
  }

  function handleReset() {
    if (!confirm(`ליצור סיסמה זמנית חדשה עבור ${name}? הסיסמה הישנה תפסיק לעבוד.`)) return;
    startTransition(async () => {
      const res = await resetMemberPassword(userId);
      setResetResult(res);
    });
  }

  return (
    <div style={{ borderBottom: '1px solid #f2f2f2' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 18px', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
        </div>

        <select
          defaultValue={role}
          onChange={handleRoleChange}
          disabled={isPending}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
        >
          <option value="member">חבר</option>
          <option value="admin">מנהל</option>
          <option value="owner">בעלים</option>
        </select>

        <select
          defaultValue={dept || ''}
          onChange={handleDeptChange}
          disabled={isPending}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
        >
          <option value="">ללא מחלקה</option>
          <option value="לימודי">לימודי</option>
          <option value="תרומות">תרומות</option>
          <option value="מנהלה">מנהלה</option>
        </select>

        <button
          onClick={handleReset}
          disabled={isPending}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
        >
          איפוס סיסמה
        </button>

        {!isSelf && (
          <button
            onClick={handleRemove}
            disabled={isPending}
            style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, cursor: 'pointer' }}
          >
            הסרה
          </button>
        )}
      </div>

      {resetResult?.success && (
        <div style={{
          margin: '0 18px 12px', background: 'var(--amber-bg)', border: '1px solid #fde68a',
          borderRadius: 8, padding: '10px 14px', fontSize: 12.5,
        }}>
          סיסמה זמנית חדשה עבור {name}: <b style={{ fontFamily: 'monospace' }}>{resetResult.password}</b>
          <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>מוצגת פעם אחת — תעתיק ותשלח עכשיו.</div>
        </div>
      )}
      {resetResult?.error && (
        <div style={{ margin: '0 18px 12px', fontSize: 12, color: 'var(--red)' }}>שגיאה: {resetResult.error}</div>
      )}
    </div>
  );
}
