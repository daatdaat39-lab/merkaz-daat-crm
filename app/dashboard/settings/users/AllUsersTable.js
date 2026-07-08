'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMembership } from './actions';

export default function AllUsersTable({ workspaces, users, currentUserId }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(userId, workspaceId, value) {
    const role = value === '' ? null : value;
    startTransition(async () => {
      await setMembership(userId, workspaceId, role);
      router.refresh();
    });
  }

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
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
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
                        onChange={(e) => handleChange(u.id, w.id, e.target.value)}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
