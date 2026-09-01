'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  getCallableCampaignSummary, listCategoryContactsForCalling, claimNextContact,
  startCallSession, logBreakStart, logBreakEnd, endCallSession,
  searchCampaignContactsForCalling, claimSpecificContact, getMyPendingCallbacks, getMyDonationAttributions,
} from '../callQueueActions';
import ActiveCallPanel from './ActiveCallPanel';
import DonationCelebrationToast from './DonationCelebrationToast';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };
const cardStyle = { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 };

// טבלה רגילה לעיון + כפתור "התקשר לבא בתור" שפותח מודאל ממוקד לשיחה
// עצמה - לא כרטיס-יחיד למסך כולו (יש תקדים מפורש ב-MappingQueue.js
// שהוחלף בטבלה לפי בקשת המשתמש - טבלה נשארת ברירת-המחדל לעיון/פיקוח).
// isLockedTelemarketer: תפקיד "טלפן" הנעול מקבל חוויה שונה לגמרי - בלי
// טבלה בכלל (גם לא נשלפת), לולאת-שיחות רצופה אמיתית במקום מסך-ביניים,
// ופס-משמרת (הפסקה/סיום) - ר' call_session_events, migration 0099.
export default function CallQueueClient({ campaignId, stages, workspaceId, whatsappTemplates = [], isLockedTelemarketer = false }) {
  const [summary, setSummary] = useState(null);
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [emptyMessage, setEmptyMessage] = useState('');
  const [error, setError] = useState('');
  const [session, setSession] = useState('idle'); // idle | active | break | ended
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  // "ביקשו ממני לחזור אליהם" - רק שיחות-החזרה שהנציג הזה עצמו קבע (ר'
  // migration 0116) - לא מסיר מהתור הרגיל, רק תצוגה/גישה מהירה נוספת.
  const [myCallbacks, setMyCallbacks] = useState([]);
  const [showMyCallbacks, setShowMyCallbacks] = useState(false);
  // "תרמו אחרי שדיברנו איתם" - ר' getMyDonationAttributions, migration
  // 0122. אותו דפוס בדיוק כמו myCallbacks.
  const [myDonations, setMyDonations] = useState([]);
  const [showMyDonations, setShowMyDonations] = useState(false);

  function loadSummary() {
    getCallableCampaignSummary(campaignId).then((res) => {
      if (res.error) { setError(res.error); return; }
      setSummary(res);
    });
  }

  function loadMyCallbacks() {
    getMyPendingCallbacks(campaignId).then((res) => {
      if (res.success) setMyCallbacks(res.rows);
    });
  }

  function loadMyDonations() {
    getMyDonationAttributions(campaignId).then((res) => {
      if (res.success) setMyDonations(res.rows);
    });
  }

  function loadRows(cat) {
    listCategoryContactsForCalling(campaignId, cat || null).then((res) => {
      if (res.success) setRows(res.rows);
    });
  }

  useEffect(() => { loadSummary(); }, [campaignId]);
  useEffect(() => { if (isLockedTelemarketer) loadMyCallbacks(); }, [campaignId, isLockedTelemarketer]);
  useEffect(() => { if (isLockedTelemarketer) loadMyDonations(); }, [campaignId, isLockedTelemarketer]);
  useEffect(() => {
    if (!isLockedTelemarketer) loadRows(category);
  }, [campaignId, category, isLockedTelemarketer]);

  function handleCallNext(excludeRowId) {
    setError('');
    setEmptyMessage('');
    startTransition(async () => {
      if (isLockedTelemarketer && session === 'idle') { await startCallSession(campaignId); setSession('active'); }
      const res = await claimNextContact(campaignId, category || null, excludeRowId);
      if (res.error) { setError(res.error); return; }
      if (!res.contact) { setEmptyMessage('אין יותר אנשי קשר בקטגוריה הזו כרגע - נסו קטגוריה אחרת.'); return; }
      setActiveContact(res.contact);
    });
  }

  // stayClosed (מגיע מ-✕ בכותרת הפאנל) - סוגר וחוזר למסך-ביניים (הפסקה/
  // סיום-יום זמינים שם) בלי לתפוס איש-קשר הבא, בניגוד ל"דלג"/"הבא ←"
  // שממשיכים אוטומטית. skippedRowId מועבר הלאה כ-exclude כדי שהתפיסה
  // הבאה לא "תדלג בחזרה" לאותה שורה בדיוק ששוחררה הרגע (ר' migration
  // 0108 - order by cc.id דטרמיניסטי היה מחזיר מיד את אותו איש-קשר).
  function handlePanelClosed({ autoAdvance, skippedRowId, stayClosed } = {}) {
    setActiveContact(null);
    loadSummary();
    if (!isLockedTelemarketer) loadRows(category);
    if (isLockedTelemarketer) { loadMyCallbacks(); loadMyDonations(); }
    if (!stayClosed && (isLockedTelemarketer || autoAdvance)) handleCallNext(skippedRowId);
  }

  function handleBreak() {
    startTransition(async () => {
      await logBreakStart(campaignId);
      setSession('break');
    });
  }

  function handleResumeFromBreak() {
    startTransition(async () => {
      await logBreakEnd(campaignId);
      setSession('active');
    });
  }

  function handleEndDay() {
    startTransition(async () => {
      await endCallSession(campaignId);
      setSession('ended');
    });
  }

  function handleContinueAnyway() {
    startTransition(async () => {
      await startCallSession(campaignId);
      setSession('active');
    });
  }

  // "מישהו חוזר אליי" - חיפוש עם דיליי קצר (לא שאילתה על כל הקשה),
  // רלוונטי רק בתפקיד "טלפן" הנעול ורק כשאין שיחה פעילה כרגע.
  useEffect(() => {
    if (!isLockedTelemarketer) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      searchCampaignContactsForCalling(campaignId, q).then((res) => {
        setSearching(false);
        if (res?.error) { setSearchError(res.error); return; }
        setSearchError('');
        setSearchResults(res.rows || []);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, campaignId, isLockedTelemarketer]);

  function handleSearchSelect(rowId) {
    setSearchError('');
    startTransition(async () => {
      const res = await claimSpecificContact(campaignId, rowId);
      if (res.error) { setSearchError(res.error); return; }
      if (!res.contact) { setSearchError('איש הקשר הזה כרגע בשיחה אצל נציג אחר.'); return; }
      setSearchQuery(''); setSearchResults([]);
      setActiveContact(res.contact);
    });
  }

  if (isLockedTelemarketer) {
    return (
      <div>
        <DonationCelebrationToast campaignId={campaignId} />

        {error && (
          <div style={{ marginBottom: 14, background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#c62828' }}>
            {error}
          </div>
        )}

        {session === 'break' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>☕</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>בהפסקה</div>
            <button
              type="button" onClick={handleResumeFromBreak} disabled={isPending}
              style={{ ...inputStyle, fontSize: 15, fontWeight: 700, padding: '12px 28px', background: 'var(--accent, #2f6f4f)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}
            >
              חזרה מהפסקה
            </button>
          </div>
        )}

        {session === 'ended' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>🙏</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>היום הסתיים, תודה!</div>
            <button type="button" onClick={handleContinueAnyway} disabled={isPending} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
              המשך בכל זאת
            </button>
          </div>
        )}

        {session !== 'break' && session !== 'ended' && !activeContact && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '50px 20px', textAlign: 'center' }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, fontSize: 14 }}>
              <option value="">הכל</option>
              {(summary?.categories || []).map((c) => (
                <option key={c} value={c}>{c} ({summary?.countByCategory?.[c] || 0})</option>
              ))}
            </select>
            <button
              type="button" onClick={() => handleCallNext()} disabled={isPending}
              style={{ ...inputStyle, fontSize: 16, fontWeight: 700, padding: '14px 32px', background: 'var(--accent, #2f6f4f)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}
            >
              🚀 התחל שיחות
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {summary ? `${summary.total} אנשי קשר ממתינים לשיחה` : 'טוען...'}
            </span>
            {emptyMessage && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{emptyMessage}</div>}

            {session === 'active' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={handleBreak} disabled={isPending} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>☕ הפסקה</button>
                <button type="button" onClick={handleEndDay} disabled={isPending} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>⏹ סיום להיום</button>
              </div>
            )}

            {myCallbacks.length > 0 && (
              <div style={{ width: '100%', maxWidth: 380, marginTop: 20 }}>
                <button
                  type="button" onClick={() => setShowMyCallbacks((v) => !v)}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>📅 ביקשו ממני לחזור אליהם ({myCallbacks.length})</span>
                  <span>{showMyCallbacks ? '▴' : '▾'}</span>
                </button>
                {showMyCallbacks && (
                  <div style={{ marginTop: 8, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden', textAlign: 'right' }}>
                    {myCallbacks.map((r) => (
                      <button
                        key={r.rowId} type="button" onClick={() => handleSearchSelect(r.rowId)} disabled={isPending}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right',
                          padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border, #f0f0f0)', background: 'var(--bg)', cursor: 'pointer',
                        }}
                      >
                        <span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name || '—'}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · {r.phone || '—'}</span>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.callbackAt ? new Date(r.callbackAt).toLocaleString('he-IL') : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {myDonations.length > 0 && (
              <div style={{ width: '100%', maxWidth: 380, marginTop: 20 }}>
                <button
                  type="button" onClick={() => setShowMyDonations((v) => !v)}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>🎉 תרמו אחרי שדיברנו איתם ({myDonations.length})</span>
                  <span>{showMyDonations ? '▴' : '▾'}</span>
                </button>
                {showMyDonations && (
                  <div style={{ marginTop: 8, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden', textAlign: 'right' }}>
                    {myDonations.map((r, i) => (
                      <Link
                        key={r.contactId + ':' + i} href={`/dashboard/contacts/${r.contactId}`}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right',
                          padding: '9px 12px', borderBottom: '1px solid var(--border, #f0f0f0)', background: 'var(--bg)', color: 'inherit', textDecoration: 'none',
                        }}
                      >
                        <span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name || '—'}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · {r.line}</span>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.occurredAt ? new Date(r.occurredAt).toLocaleDateString('he-IL') : ''}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ width: '100%', maxWidth: 380, marginTop: 20, borderTop: '1px solid var(--border, #e5e5e5)', paddingTop: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>🔍 מישהו חוזר אליכם? חפשו לפי שם, טלפון או ת.ז</div>
              <input
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="שם, טלפון או ת.ז..." style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
              {searching && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>מחפש...</div>}
              {searchError && <div style={{ fontSize: 11.5, color: '#c62828', marginTop: 6 }}>{searchError}</div>}
              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && !searchError && (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>לא נמצא אף אחד ברשימת הקמפיין הזה</div>
              )}
              {searchResults.length > 0 && (
                <div style={{ marginTop: 8, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden', textAlign: 'right' }}>
                  {searchResults.map((r) => (
                    <button
                      key={r.rowId} type="button" onClick={() => handleSearchSelect(r.rowId)} disabled={isPending || !!r.claimedByName}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right',
                        padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border, #f0f0f0)', background: 'var(--bg)',
                        cursor: r.claimedByName ? 'not-allowed' : 'pointer', opacity: r.claimedByName ? 0.55 : 1,
                      }}
                    >
                      <span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name || '—'}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · {r.phone || '—'}</span>
                      </span>
                      <span style={{ fontSize: 11, color: r.claimedByName ? '#b26a00' : 'var(--text-muted)' }}>
                        {r.claimedByName ? `בשיחה אצל ${r.claimedByName}` : (r.category || '')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeContact && (
          <ActiveCallPanel
            contact={activeContact} stages={stages} workspaceId={workspaceId} whatsappTemplates={whatsappTemplates}
            onClose={handlePanelClosed}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 14, background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#c62828' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          <option value="">הכל</option>
          {(summary?.categories || []).map((c) => (
            <option key={c} value={c}>{c} ({summary?.countByCategory?.[c] || 0})</option>
          ))}
        </select>
        <button
          type="button" onClick={() => handleCallNext()} disabled={isPending || !!activeContact}
          style={{ ...inputStyle, background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, cursor: 'pointer', border: 'none' }}
        >
          📞 התקשר לבא בתור
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {summary ? `${summary.total} אנשי קשר ממתינים לשיחה` : 'טוען...'}
        </span>
      </div>

      {emptyMessage && (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>{emptyMessage}</div>
      )}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary, #f7f7f7)', textAlign: 'right' }}>
                <th style={{ padding: '8px 12px' }}>שם</th>
                <th style={{ padding: '8px 12px' }}>טלפון</th>
                <th style={{ padding: '8px 12px' }}>סטטוס</th>
                <th style={{ padding: '8px 12px' }}>נתפס ע"י</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowId} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ padding: '8px 12px' }}>{r.name}</td>
                  <td style={{ padding: '8px 12px' }}>{r.phone}</td>
                  <td style={{ padding: '8px 12px' }}>{stages.find((s) => s.stageKey === r.status)?.label || r.status}</td>
                  <td style={{ padding: '8px 12px', color: r.claimedByName ? '#b26a00' : 'var(--text-muted)' }}>
                    {r.claimedByName || '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>אין שורות להצגה</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeContact && (
        <ActiveCallPanel
          contact={activeContact} stages={stages} workspaceId={workspaceId} whatsappTemplates={whatsappTemplates}
          onClose={handlePanelClosed}
        />
      )}
    </div>
  );
}
