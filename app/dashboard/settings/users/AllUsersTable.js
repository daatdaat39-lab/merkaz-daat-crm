'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMembership, resetMemberPassword, setMemberPassword, changeMemberEmail, updateMemberName, updateMemberExtension, suspendUser, reactivateUser } from './actions';

// מה כל תפקיד מאפשר בפועל - רק תפקידים שהמערכת באמת אוכפת. (בעתיד יתווספו
// "נציג שירות" ו"צופה" - הם קיימים בבסיס הנתונים אבל עדיין לא נאכפים בכל
// המסכים, ולכן לא מוצעים כאן כדי לא ליצור תחושת אבטחה שאינה אמיתית.)
const ROLE_HELP = [
  ['נציג', 'עובד עם אנשי קשר, לידים, משימות ושליחת הודעות במחלקה. לא רואה הגדרות, ייצוא או ניהול משתמשים.'],
  ['טלפן', 'רואה אך ורק את תור השיחות - שום מסך אחר במערכת.'],
  ['מנהל מחלקה', 'כמו נציג, ובנוסף: הגדרות המחלקה, ייבוא/ייצוא, תבניות, וניהול משתמשי המחלקה.'],
  ['בעלים', 'כל היכולות, כולל ניהול כל המשתמשים וכל המחלקות והגדרות כלליות.'],
];

function isTestAccount(email) {
  return /@test\.local$/i.test(email || '');
}

function formatLastSeen(iso) {
  if (!iso) return 'מעולם לא התחבר';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 60) return `לפני ${days} ימים`;
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

export default function AllUsersTable({ workspaces, users, currentUserId }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const q = query.trim().toLowerCase();
  const visibleUsers = users.filter((u) => {
    if (statusFilter === 'active' && u.status === 'suspended') return false;
    if (statusFilter === 'suspended' && u.status !== 'suspended') return false;
    if (statusFilter === 'real' && (u.status === 'suspended' || isTestAccount(u.email))) return false;
    if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const testCount = users.filter((u) => isTestAccount(u.email)).length;

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
        כל המשתמשים וכל המחלקות ({visibleUsers.length} מתוך {users.length})
      </div>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם או אימייל..."
          style={{ flex: 1, minWidth: 180, border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
        >
          <option value="active">פעילים</option>
          <option value="real">פעילים בלי חשבונות בדיקה{testCount ? ` (מסתיר ${testCount})` : ''}</option>
          <option value="suspended">מושבתים</option>
          <option value="all">הכול</option>
        </select>
      </div>
      <details style={{ borderBottom: '1px solid var(--border)' }}>
        <summary style={{ padding: '9px 18px', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          מה כל הרשאה מאפשרת?
        </summary>
        <div style={{ padding: '4px 18px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
          {ROLE_HELP.map(([name, text]) => (
            <div key={name}><b>{name}</b> — {text}</div>
          ))}
        </div>
      </details>
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
            {visibleUsers.map((u) => (
              <UserRow key={u.id} user={u} workspaces={workspaces} currentUserId={currentUserId} allUsers={users} />
            ))}
            {visibleUsers.length === 0 && (
              <tr><td colSpan={workspaces.length + 2} style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)' }}>אין משתמשים שמתאימים לסינון</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user: u, workspaces, currentUserId, allUsers = [] }) {
  const suspended = u.status === 'suspended';
  const [reassignTo, setReassignTo] = useState('');
  const [suspendResult, setSuspendResult] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [nameValue, setNameValue] = useState(u.name || '');
  const [nameResult, setNameResult] = useState(null);
  const [emailValue, setEmailValue] = useState(u.email || '');
  const [emailResult, setEmailResult] = useState(null);
  const [customPassword, setCustomPassword] = useState('');
  const [resetResult, setResetResult] = useState(null);
  const [extensionValue, setExtensionValue] = useState(u.hallo015Extension || '');
  const [extensionResult, setExtensionResult] = useState(null);
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

  function handleSuspend() {
    const target = allUsers.find((x) => x.id === reassignTo);
    const consequence = target
      ? `לידים, קריאות שירות ומשימות פתוחים יועברו אל ${target.name}.`
      : 'לידים ומשימות פתוחים שלו יישארו משויכים אליו ולא יטופלו.';
    if (!confirm(`להשבית את ${u.name}? הוא ינותק מיד מכל המכשירים ולא יוכל להתחבר. ${consequence} ההיסטוריה שלו נשמרת ואפשר להפעיל אותו מחדש.`)) return;
    startTransition(async () => {
      const res = await suspendUser(u.id, { reassignToUserId: reassignTo || undefined });
      setSuspendResult(res);
      if (res.success) router.refresh();
    });
  }

  function handleReactivate() {
    startTransition(async () => {
      const res = await reactivateUser(u.id);
      setSuspendResult(res);
      if (res.success) router.refresh();
    });
  }

  function handleSaveExtension() {
    if (extensionValue === (u.hallo015Extension || '')) return;
    startTransition(async () => {
      const res = await updateMemberExtension(u.id, extensionValue);
      setExtensionResult(res);
      if (res.success) router.refresh();
    });
  }

  return (
    <>
      <tr>
        <td style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, opacity: suspended ? 0.6 : 1 }}>
            {u.name}
            {suspended && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--red)', borderRadius: 999, padding: '1px 7px' }}>מושבת</span>}
            {isTestAccount(u.email) && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 999, padding: '1px 7px' }}>בדיקה</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>נראה לאחרונה: {formatLastSeen(u.lastSeenAt)}</div>
        </td>
        {workspaces.map((w) => {
          const role = u.memberships[w.id] || '';
          const isSelfOwnerHere = u.id === currentUserId && role === 'owner';
          return (
            <td key={w.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
              <select
                value={role}
                disabled={isPending || isSelfOwnerHere}
                onChange={(e) => handleMembershipChange(w.id, e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontSize: 11.5 }}
              >
                <option value="">לא שייך</option>
                <option value="member">נציג</option>
                <option value="telemarketer">טלפן</option>
                <option value="admin">מנהל מחלקה</option>
                <option value="owner">בעלים</option>
              </select>
            </td>
          );
        })}
        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap' }}>
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
          <td colSpan={workspaces.length + 2} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
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
                      background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '7px 14px', fontSize: 12.5, cursor: 'pointer',
                    }}
                  >
                    סיסמה אקראית
                  </button>
                </div>
              </div>

              {resetResult?.success && (
                <div style={{
                  background: 'var(--amber-bg)', border: '1px solid var(--amber)',
                  borderRadius: 8, padding: '10px 14px', fontSize: 12.5,
                }}>
                  הסיסמה עבור {u.name}: <b style={{ fontFamily: 'monospace' }}>{resetResult.password}</b>
                  <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 3 }}>מוצגת פעם אחת — תעתיק ותשלח עכשיו.</div>
                </div>
              )}
              {resetResult?.error && (
                <div style={{ fontSize: 12, color: 'var(--red)' }}>שגיאה: {resetResult.error}</div>
              )}

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  שלוחת 015 (לחיוג-יזום מהמערכת — לפי "Telephone lines" בפאנל של 015)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={extensionValue}
                    onChange={(e) => setExtensionValue(e.target.value)}
                    type="text"
                    placeholder="למשל: 5668598446"
                    style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
                  />
                  <button
                    onClick={handleSaveExtension}
                    disabled={isPending || extensionValue === (u.hallo015Extension || '')}
                    style={{
                      background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6,
                      padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', opacity: extensionValue === (u.hallo015Extension || '') ? 0.5 : 1,
                    }}
                  >
                    עדכון
                  </button>
                </div>
                {extensionResult?.success && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>✓ השלוחה עודכנה</div>}
                {extensionResult?.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>שגיאה: {extensionResult.error}</div>}
              </div>

              {u.id !== currentUserId && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {suspended ? 'המשתמש מושבת - לא יכול להתחבר.' : 'השבתה (במקום מחיקה): ניתוק מיידי מכל המכשירים, ההיסטוריה נשמרת.'}
                  </div>
                  {suspended ? (
                    <button
                      onClick={handleReactivate}
                      disabled={isPending}
                      style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }}
                    >
                      הפעלה מחדש
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, minWidth: 200 }}
                      >
                        <option value="">לא להעביר עבודה פתוחה</option>
                        {allUsers.filter((x) => x.id !== u.id && x.status !== 'suspended').map((x) => (
                          <option key={x.id} value={x.id}>העבר לידים ומשימות פתוחים אל {x.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleSuspend}
                        disabled={isPending}
                        style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }}
                      >
                        השבתת משתמש
                      </button>
                    </div>
                  )}
                  {suspendResult?.success && suspendResult.reassigned && (
                    <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>
                      ✓ הועברו {suspendResult.reassigned.leads} לידים, {suspendResult.reassigned.cases} קריאות שירות, {suspendResult.reassigned.tasks} משימות
                    </div>
                  )}
                  {suspendResult?.error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>שגיאה: {suspendResult.error}</div>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
