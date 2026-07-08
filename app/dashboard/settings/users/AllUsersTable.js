'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMembership, resetMemberPassword, setMemberPassword, changeMemberEmail, updateMemberName } from './actions';

export default function AllUsersTable({ workspaces, users, currentUserId }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
        כל המשתמשים וכל המחלקות ({users.length})
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', padding: '10px 18px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                משתמש
              </th>
              {workspaces.map((w) => (
                <th
                  key={w.id}
                  style={{ textAlign: 'center', padding: '10px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {w.name}
                </th>
              ))}
              <th style={{ padding: '10px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} workspaces={workspaces} currentUserId={currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user: u, workspaces, currentUserId }) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [nameValue, setNameValue] = useState(u.name || '');
  const [nameResult, setNameResult] = useState(null);
  const [emailValue, setEmailValue] = useState(u.email || '');
  const [emailResult, setEmailResult] = useState(null);
  const [customPassword, setCustomPassword] = useState('');
  const [resetResult, setResetResult] = useState(null);
  const router = useRouter();

  function handleSaveName() {
    if (!nameValue.trim() || nameValue === u.name) return;
    startTransition(async () => {
      const res = await updateMemberName(u.id, nameValue);
      setNameResult(res);
      if (res.success) router.refresh();
    });
  }

  function handleMembershipChange(workspaceId, value) {
    const role = value === '' ? null : value;
    startTransition(async () => {
      await setMembership(u.id, workspaceId, role);
      router.refresh();
    });
  }

  function handleSaveEmail() {
    if (emailValue === u.email) return;
    startTransition(async () => {
      const res = await changeMemberEmail(u.id, emailValue);
      setEmailResult(res);
      if (res.success) router.refresh();
    });
  }

  function handleSetPassword() {
    if (!customPassword) return;
    startTransition(async () => {
      const res = await setMemberPassword(u.id, customPassword);
      setResetResult(res);
      if (res.success) setCustomPassword('');
    });
  }

  function handleReset() {
    if (!confirm(`ליצור סיסמה זמנית אקראית עבור ${u.name}? הסיסמה הישנה תפסיק לעבוד.`)) return;
    startTransition(async () => {
      const res = await resetMemberPassword(u.id);
      setResetResult(res);
    });
  }

  return (
    <>
      <tr>
        <td style={{ padding: '8px 18px', borderBottom: '1px solid #f2f2f2', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 500 }}>{u.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>
        </td>
        {workspaces.map((w) => {
          const role = u.memberships[w.id] || '';
          const isSelfOwnerHere = u.id === currentUserId && role === 'owner';
          return (
            <td key={w.id} style={{ padding: '8px 10px', borderBottom: '1px solid #f2f2f2', textAlign: 'center' }}>
              <select
                value={role}
                disabled={isPending || isSelfOwnerHere}
                onChange={(e) => handleMembershipChange(w.id, e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontSize: 11.5 }}
              >
                <option value="">לא שייך</option>
                <option value="member">נציג</option>
                <option value="admin">מנהל מחלקה</option>
                <option value="owner">בעלים</option>
              </select>
            </td>
          );
        })}
        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f2f2f2', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={isPending}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
          >
            {expanded ? 'סגירה ▲' : 'חשבון ▾'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={workspaces.length + 2} style={{ padding: 0, borderBottom: '1px solid #f2f2f2' }}>
            <div style={{
              margin: '0 18px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
            }}>
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
                    disabled={isPending || !nameValue.trim() || nameValue === u.name}
                    style={{
                      background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                      padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', opacity: (!nameValue.trim() || nameValue === u.name) ? 0.5 : 1,
                    }}
                  >
                    עדכון
                  </button>
                </div>
                {nameResult?.success && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>✓ השם עודכן</div>}
                {nameResult?.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>שגיאה: {nameResult.error}</div>}
              </div>

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
                    disabled={isPending || emailValue === u.email}
                    style={{
                      background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                      padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', opacity: emailValue === u.email ? 0.5 : 1,
                    }}
                  >
                    עדכון
                  </button>
                </div>
                {emailResult?.success && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>✓ שם המשתמש עודכן</div>}
                {emailResult?.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>שגיאה: {emailResult.error}</div>}
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  סיסמה (לא ניתן להציג סיסמה קיימת מטעמי אבטחה — אפשר רק לקבוע סיסמה חדשה)
                </div>
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
                  הסיסמה עבור {u.name}: <b style={{ fontFamily: 'monospace' }}>{resetResult.password}</b>
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>מוצגת פעם אחת — תעתיק ותשלח עכשיו.</div>
                </div>
              )}
              {resetResult?.error && (
                <div style={{ fontSize: 12, color: 'var(--red)' }}>שגיאה: {resetResult.error}</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
