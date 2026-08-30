'use client';

import { useEffect, useState, useTransition } from 'react';
import { logCallOutcomeAndAdvance, skipContact } from '../callQueueActions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };

function telHref(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

// מודאל ממוקד לשיחה פעילה - נפתח רק כשיש תפיסה בפועל (ר' CallQueueClient).
// tel: הוא ה-click-to-call הראשון בכל המערכת (ר' גם ContactQuickActions.js) -
// הטלפניות מתקשרות מהנייד האישי שלהן, לא דרך שלוחת 015, אז אין שום מקום
// אחר שבו השיחה נרשמת אוטומטית - ההערה כאן היא הרישום היחיד שיש.
export default function ActiveCallPanel({ contact, stages, onClose }) {
  const [status, setStatus] = useState(contact.status);
  const [note, setNote] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function releaseOnHide() {
      if (document.visibilityState === 'hidden') skipContact(contact.rowId);
    }
    window.addEventListener('beforeunload', releaseOnHide);
    document.addEventListener('visibilitychange', releaseOnHide);
    return () => {
      window.removeEventListener('beforeunload', releaseOnHide);
      document.removeEventListener('visibilitychange', releaseOnHide);
    };
  }, [contact.rowId]);

  function handleSave() {
    setError('');
    startTransition(async () => {
      const res = await logCallOutcomeAndAdvance(contact.rowId, { newStatus: stages.length ? status : undefined, note });
      if (res.error) { setError(res.error); return; }
      onClose({ autoAdvance });
    });
  }

  function handleSkip() {
    setError('');
    startTransition(async () => {
      const res = await skipContact(contact.rowId);
      if (res.error) { setError(res.error); return; }
      onClose({});
    });
  }

  const spouseWarning = contact.spouse && (() => {
    if (contact.spouse.claimedBy) return `⚠ בן/בת הזוג נמצא/ת כרגע בשיחה אצל נציג אחר`;
    const wonStages = stages.filter((s) => s.isWon).map((s) => s.stageKey);
    if (wonStages.includes(contact.spouse.status)) return 'בן/בת הזוג כבר טופל/ה בקמפיין הזה';
    return null;
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 10, width: 480, maxWidth: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{contact.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{contact.category}</div>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {telHref(contact.phone) && (
              <a href={telHref(contact.phone)} style={{ ...inputStyle, width: 'auto', textDecoration: 'none', color: '#fff', background: '#2f6f4f', fontWeight: 600 }}>
                📞 {contact.phone}
              </a>
            )}
            {telHref(contact.phone2) && (
              <a href={telHref(contact.phone2)} style={{ ...inputStyle, width: 'auto', textDecoration: 'none', color: 'inherit' }}>
                📞 {contact.phone2} (משני)
              </a>
            )}
          </div>
          {contact.email && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>✉️ {contact.email}</div>}

          {contact.insights && (
            <div style={{ fontSize: 12, background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {contact.insights.peakDonation && <div>שנת-שיא: {contact.insights.peakDonation.year} · ₪{contact.insights.peakDonation.amount.toLocaleString()}</div>}
              <div>סה"כ תרומות: {contact.insights.totalDonations.count} · ₪{contact.insights.totalDonations.total.toLocaleString()}</div>
              {contact.insights.lastDonationDate && <div>תרומה אחרונה: {contact.insights.lastDonationDate}</div>}
              {contact.insights.hasActiveCommitment && <div>יש הוראת קבע פעילה</div>}
            </div>
          )}

          {spouseWarning && (
            <div style={{ fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', color: '#92400e' }}>
              {spouseWarning}
            </div>
          )}

          {stages.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4, color: 'var(--text-secondary)' }}>סטטוס</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {stages.map((s) => <option key={s.stageKey} value={s.stageKey}>{s.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4, color: 'var(--text-secondary)' }}>הערה על השיחה</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="מה קרה בשיחה?" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
            המשך אוטומטית לבא בתור אחרי שמירה
          </label>

          {error && <div style={{ fontSize: 12, color: '#c62828' }}>{error}</div>}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border, #e5e5e5)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleSkip} disabled={isPending} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>דלג</button>
          <button
            type="button" onClick={handleSave} disabled={isPending}
            style={{ ...inputStyle, width: 'auto', background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, cursor: 'pointer', border: 'none' }}
          >
            שמור והתקדם
          </button>
        </div>
      </div>
    </div>
  );
}
