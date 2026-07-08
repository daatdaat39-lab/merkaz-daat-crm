'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setMembership, resetMemberPassword, changeMemberEmail, setMemberPassword, updateMemberName,
} from './actions';

export default function MemberRow({ userId, name, role, workspaceId, email, allMemberships, isSelf }) {
  const [isPending, startTransition] = useTransition();
  const [resetResult, setResetResult] = useState(null);
  const [nameValue, setNameValue] = useState(name || '');
  const [nameResult, setNameResult] = useState(null);
  const [emailValue, setEmailValue] = useState(email || '');
  const [emailResult, setEmailResult] = useState(null);
  const [customPassword, setCustomPassword] = useState('');
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  function handleSaveName() {
    if (!nameValue.trim() || nameValue === name) return;
    startTransition(async () => {
      const res = await updateMemberName(userId, nameValue);
      setNameResult(res);
      if (res.success) router.refresh();
    });
  }

  function handleRoleChange(e) {
    const newRole = e.target.value;
    startTransition(async () => {
      await setMembership(userId, workspaceId, newRole);
      router.refresh();
    });
  }

  function handleRemove() {
    if (!confirm(`להסיר את ${name} מה-workspace?`)) return;
    startTransition(async () => {
      await setMembership(userId, workspaceId, null);
      router.refresh();
    });
  }

  function handleReset() {
    if (!confirm(`ליצור סיסמה זמנית אקראית עבור ${name}? הסיסמה הישנה תפסיק לעבוד.`)) return;
    startTransition(async () => {
      const res = await resetMemberPassword(userId);
      setResetResult(res);
    });
  }

  function handleSetPassword() {
    if (!customPassword) return;
    startTransition(async () => {
      const res = await setMemberPassword(userId, customPassword);
      setResetResult(res);
      if (res.success) setCustomPassword('');
    });
  }

  function handleSaveEmail() {
    if (emailValue === email) return;
    startTransition(async () => {
      const res = await changeMemberEmail(userId, emailValue);
      setEmailResult(res);
      if (res.success) router.refresh();
    });
  }

  return (
    <div style={{ borderBottom: '1px solid #f2f2f2' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 18px', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{email}</div>
          {allMemberships && allMemberships.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {allMemberships.map((m, i) => (
                <span key={i} style={{
                  fontSize: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                  padding: '1px 7px', borderRadius: 8,
                }}>
                  {m.workspaceName} ({m.role === 'owner' ? 'בעלים' : m.role === 'admin' ? 'מנהל' : 'חבר'})
                </span>
              ))}
            </div>
          )}
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

        <button
          onClick={() => setExpanded((v) => !v)}
          disabled={isPending}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
        >
          {expanded ? 'סגירה ▲' : 'שם משתמש / סיסמה ▾'}
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

      {expanded && (
        <div style={{
          margin: '0 18px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* עריכת שם מלא */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>שם מלא</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                type="text"
                style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
              />
              <button
                onClick={handleSaveName}
                disabled={isPending || !nameValue.trim() || nameValue === name}
                style={{
                  background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', opacity: (!nameValue.trim() || nameValue === name) ? 0.5 : 1,
                }}
              >
                עדכון
              </button>
            </div>
            {nameResult?.success && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>✓ השם עודכן</div>}
            {nameResult?.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>שגיאה: {nameResult.error}</div>}
          </div>

          {/* עריכת שם משתמש (אימייל) */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>שם משתמש (אימייל להתחברות)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                type="email"
                style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
              />
              <button
                onClick={handleSaveEmail}
                disabled={isPending || emailValue === email}
                style={{
                  background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', opacity: emailValue === email ? 0.5 : 1,
                }}
              >
                עדכון
              </button>
            </div>
            {emailResult?.success && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>✓ שם המשתמש עודכן</div>}
            {emailResult?.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>שגיאה: {emailResult.error}</div>}
          </div>

          {/* סיסמה */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>סיסמה</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                type="text"
                placeholder="הקלד סיסמה חדשה לבחירתך..."
                style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
              />
              <button
                onClick={handleSetPassword}
                disabled={isPending || !customPassword}
                style={{
                  background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', opacity: !customPassword ? 0.5 : 1,
                }}
              >
                קביעת סיסמה זו
              </button>
              <button
                onClick={handleReset}
                disabled={isPending}
                style={{
                  background: '#fff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '7px 14px', fontSize: 12.5, cursor: 'pointer',
                }}
              >
                סיסמה אקראית
              </button>
            </div>
          </div>

          {resetResult?.success && (
            <div style={{
              background: 'var(--amber-bg)', border: '1px solid #fde68a',
              borderRadius: 8, padding: '10px 14px', fontSize: 12.5,
            }}>
              הסיסמה עבור {name}: <b style={{ fontFamily: 'monospace' }}>{resetResult.password}</b>
              <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>מוצגת פעם אחת — תעתיק ותשלח עכשיו.</div>
            </div>
          )}
          {resetResult?.error && (
            <div style={{ fontSize: 12, color: 'var(--red)' }}>שגיאה: {resetResult.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
