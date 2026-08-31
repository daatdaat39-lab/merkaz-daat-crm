'use client';

import { useEffect, useState, useTransition } from 'react';
import { logCallAttempt, skipContact, quickNoAnswer, undoLastCallAttempt } from '../callQueueActions';
import WhatsAppSendModal from '../../../../contacts/[id]/WhatsAppSendModal';
import ContactSummaryPanel from './ContactSummaryPanel';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const btnStyle = { ...inputStyle, width: 'auto', cursor: 'pointer' };
const primaryBtn = { ...btnStyle, background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, border: 'none' };
const warmBtn = { ...btnStyle, background: '#c8791f', color: '#fff', fontWeight: 600, border: 'none' };
const cardStyle = { background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em' };

const OUTCOME_LABELS = {
  no_answer: 'לא ענה', donating_now: 'תורם עכשיו תוך כדי הטלפון', requested_link: 'ביקש קישור לתרום בעצמו',
  not_interested: 'לא מעוניין לתרום', call_back: 'ביקש להתקשר מאוחר יותר',
  wrong_number: 'מספר שגוי (לא האדם)', duplicate_contact: 'כפילות ברשימה',
  active_donation: 'יש כבר תרומה/הוראת קבע פעילה', number_issue: 'בעיה במספר',
};
const NO_ANSWER_REASONS = [
  { key: 'busy', label: 'תפוס' }, { key: 'wrong_number', label: 'מספר שגוי' },
  { key: 'voicemail', label: 'תא קולי' }, { key: '', label: 'אחר' },
];
const ANSWERED_OUTCOMES = [
  { key: 'donating_now', label: 'תורם עכשיו תוך כדי הטלפון' },
  { key: 'requested_link', label: 'ביקש קישור לתרום בעצמו' },
  { key: 'not_interested', label: 'לא מעוניין לתרום' },
  { key: 'call_back', label: 'להתקשר מאוחר יותר' },
];
// דגלי איכות-נתונים - לא "תוצאת שיחה" רגילה אלא דיווח שהטלפן מזהה תוך כדי
// השיחה על בעיה בכרטיס עצמו. גם הן טרמינליות (מוציאות מהתור, ר' 0105) -
// מוצגות בנפרד מהכפתורים הרגילים כדי לא לערבב "מה קרה בשיחה" עם "יש
// בעיה בנתונים".
const DATA_QUALITY_OUTCOMES = [
  { key: 'wrong_number', label: 'מספר שגוי (לא האדם)' },
  { key: 'duplicate_contact', label: 'כפילות ברשימה' },
  { key: 'active_donation', label: 'יש כבר תרומה/הוראת קבע פעילה' },
  { key: 'number_issue', label: 'בעיה במספר (מנותק/לא בשימוש)' },
];
const NOTE_TYPES = [{ key: 'donation', label: 'לגבי תרומה' }, { key: 'general', label: 'כללי' }, { key: 'other', label: 'אחר' }];
const TIME_OF_DAY = [{ key: 'morning', label: 'בוקר', hour: 9 }, { key: 'noon', label: 'צהריים', hour: 13 }, { key: 'evening', label: 'ערב', hour: 18 }];
const DAY_OFFSETS = [{ key: 0, label: 'היום' }, { key: 1, label: 'מחר' }, { key: 2, label: 'מחרתיים' }];

function telHref(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.key} type="button" onClick={() => onChange(o.key)}
          style={{ ...btnStyle, fontSize: 12, background: value === o.key ? 'var(--accent, #2f6f4f)' : 'var(--bg)', color: value === o.key ? '#fff' : 'inherit' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CallbackScheduler({ callbackAt, onChange }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(null);

  function applyQuickPick(offset, h) {
    setDayOffset(offset);
    setHour(h);
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, 0, 0, 0);
    onChange(d.toISOString());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {DAY_OFFSETS.map((d) => TIME_OF_DAY.map((t) => (
          <button
            key={`${d.key}-${t.key}`} type="button"
            onClick={() => applyQuickPick(d.key, t.hour)}
            style={{
              ...btnStyle, fontSize: 11.5, padding: '5px 9px',
              background: dayOffset === d.key && hour === t.hour ? 'var(--accent, #2f6f4f)' : 'var(--bg)',
              color: dayOffset === d.key && hour === t.hour ? '#fff' : 'inherit',
            }}
          >
            {d.label} · {t.label}
          </button>
        )))}
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>או תאריך ושעה מדויקים</label>
        <input
          type="datetime-local" style={inputStyle}
          value={callbackAt ? new Date(callbackAt).toISOString().slice(0, 16) : ''}
          onChange={(e) => { setHour(null); onChange(e.target.value ? new Date(e.target.value).toISOString() : null); }}
        />
      </div>
    </div>
  );
}

// מודאל ממוקד לשיחה פעילה - נפתח רק כשיש תפיסה בפועל (ר' CallQueueClient).
// tel: הוא ה-click-to-call הראשון בכל המערכת (ר' גם ContactQuickActions.js) -
// הטלפניות מתקשרות מהנייד האישי שלהן, לא דרך שלוחת 015, אז אין שום מקום
// אחר שבו השיחה נרשמת אוטומטית - יומן-הניסיונות כאן הוא הרישום היחיד שיש.
// כל תוצאה (כולל "ענה") עוברת דרך מסך-אישור עם "בטל" לפני שממשיכים -
// לא רק "לא ענה" - כדי שלחיצה בטעות תמיד תהיה הפיכה. ההתקדמות לבא בתור
// תמיד ידנית (לחיצה על "הבא ←"), גם בתפקיד "טלפן" הנעול - זו בכוונה,
// לא נשארה אופציית "המשך אוטומטית" כי מסך-האישור כבר עוצר בכל מקרה.
export default function ActiveCallPanel({ contact, stages, workspaceId, whatsappTemplates = [], onClose }) {
  const [status, setStatus] = useState(contact.status);
  const [phase, setPhase] = useState('choosing'); // choosing | answered | confirming
  const [answeredOutcome, setAnsweredOutcome] = useState(null);
  const [callbackAt, setCallbackAt] = useState(null);
  const [dedicationText, setDedicationText] = useState('');
  const [donationAmount, setDonationAmount] = useState('');
  const [pledgeDetails, setPledgeDetails] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [note, setNote] = useState('');
  const [confirmResult, setConfirmResult] = useState(null); // {attemptId, attemptNumber, previousNote, outcome}
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function releaseOnHide() {
      if (document.visibilityState === 'hidden' && phase === 'choosing') skipContact(contact.rowId);
    }
    window.addEventListener('beforeunload', releaseOnHide);
    document.addEventListener('visibilitychange', releaseOnHide);
    return () => {
      window.removeEventListener('beforeunload', releaseOnHide);
      document.removeEventListener('visibilitychange', releaseOnHide);
    };
  }, [contact.rowId, phase]);

  function handleNoAnswer(reason) {
    setError('');
    startTransition(async () => {
      const res = await quickNoAnswer(contact.rowId, { note, noteType, reason: reason || null });
      if (res.error) { setError(res.error); return; }
      setConfirmResult({ ...res, outcome: 'no_answer' });
      setPhase('confirming');
    });
  }

  function handleSaveAnswered() {
    setError('');
    startTransition(async () => {
      const res = await logCallAttempt(contact.rowId, {
        outcome: answeredOutcome, note, noteType, dedicationText, donationAmount, pledgeDetails,
        callbackAt: answeredOutcome === 'call_back' ? callbackAt : null,
        newStatus: stages.length ? status : undefined,
      });
      if (res.error) { setError(res.error); return; }
      setConfirmResult({ ...res, outcome: answeredOutcome });
      setPhase('confirming');
    });
  }

  function handleUndo() {
    setError('');
    startTransition(async () => {
      const res = await undoLastCallAttempt(confirmResult.attemptId, contact.rowId, confirmResult.previousNote);
      if (res.error) { setError(res.error); return; }
      if (!res.reclaimed) { onClose({}); return; }
      setConfirmResult(null);
      setPhase('choosing');
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
    if (contact.spouse.claimedBy) return '⚠ בן/בת הזוג נמצא/ת כרגע בשיחה אצל נציג אחר';
    const wonStages = stages.filter((s) => s.isWon).map((s) => s.stageKey);
    if (wonStages.includes(contact.spouse.status)) return 'בן/בת הזוג כבר טופל/ה בקמפיין הזה';
    return null;
  })();

  const isCelebration = confirmResult?.outcome === 'donating_now';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 14, width: 920, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{contact.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{contact.category}</div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* עמודת פקדי-שיחה */}
          <div style={{ flex: '1 1 55%', padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, borderInlineEnd: '1px solid var(--border, #e5e5e5)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {telHref(contact.phone) && (
                <a href={telHref(contact.phone)} style={{ ...primaryBtn, fontSize: 15, padding: '10px 20px', textDecoration: 'none' }}>📞 {contact.phone}</a>
              )}
              {telHref(contact.phone2) && (
                <a href={telHref(contact.phone2)} style={{ ...btnStyle, textDecoration: 'none', color: 'inherit' }}>📞 {contact.phone2} (משני)</a>
              )}
              <button type="button" onClick={() => setShowWhatsApp(true)} style={btnStyle}>💬 וואטסאפ</button>
            </div>

            {spouseWarning && (
              <div style={{ fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', color: '#92400e' }}>
                {spouseWarning}
              </div>
            )}

            {phase !== 'confirming' && (
              <div style={cardStyle}>
                <div style={sectionLabel}>הערה על השיחה (אופציונלי)</div>
                <ToggleGroup options={NOTE_TYPES} value={noteType} onChange={setNoteType} />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="מה קרה בשיחה?" />
              </div>
            )}

            {phase === 'choosing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ ...sectionLabel, marginBottom: 8 }}>לא ענה</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {NO_ANSWER_REASONS.map((r) => (
                      <button key={r.key || 'other'} type="button" onClick={() => handleNoAnswer(r.key)} disabled={isPending} style={btnStyle}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setPhase('answered')} disabled={isPending} style={{ ...primaryBtn, fontSize: 14, padding: '12px 20px', borderRadius: 10 }}>ענה</button>
              </div>
            )}

            {phase === 'confirming' && confirmResult && (
              <div style={{ ...cardStyle, background: isCelebration ? '#fdf1e2' : cardStyle.background, border: isCelebration ? '1px solid #f0c987' : 'none' }}>
                <div style={{ fontSize: isCelebration ? 15 : 13, fontWeight: isCelebration ? 700 : 400, color: isCelebration ? '#a85c00' : 'inherit' }}>
                  {isCelebration ? '🎉 כל הכבוד! נרשמה תרומה' : `✓ נרשם: ${OUTCOME_LABELS[confirmResult.outcome] || confirmResult.outcome}`}
                  {confirmResult.attemptNumber ? ` (ניסיון #${confirmResult.attemptNumber})` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={handleUndo} disabled={isPending} style={btnStyle}>בטל</button>
                  <button type="button" onClick={() => onClose({ autoAdvance: true })} disabled={isPending} style={isCelebration ? warmBtn : primaryBtn}>הבא ←</button>
                </div>
              </div>
            )}

            {phase === 'answered' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ ...sectionLabel, marginBottom: 8 }}>תוצאת השיחה</div>
                  <ToggleGroup options={ANSWERED_OUTCOMES} value={answeredOutcome} onChange={setAnsweredOutcome} />
                </div>

                <div>
                  <div style={{ ...sectionLabel, marginBottom: 8 }}>או - יש בעיה בנתונים?</div>
                  <ToggleGroup options={DATA_QUALITY_OUTCOMES} value={answeredOutcome} onChange={setAnsweredOutcome} />
                  {DATA_QUALITY_OUTCOMES.some((o) => o.key === answeredOutcome) && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                      מומלץ לפרט למה בשדה ההערה למעלה - זה יעזור למנהל.
                    </div>
                  )}
                </div>

                {answeredOutcome === 'call_back' && (
                  <div style={cardStyle}>
                    <div style={sectionLabel}>מתי לחזור</div>
                    <CallbackScheduler callbackAt={callbackAt} onChange={setCallbackAt} />
                  </div>
                )}

                {answeredOutcome === 'donating_now' && (
                  <div style={cardStyle}>
                    <div style={sectionLabel}>פרטי התרומה (לתיוג בלבד - לא יוצר רשומת-תרומה אמיתית)</div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>סכום</label>
                      <input type="number" value={donationAmount} onChange={(e) => setDonationAmount(e.target.value)} style={inputStyle} placeholder="₪" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>הקדשה (אם יש)</label>
                      <textarea
                        value={dedicationText} onChange={(e) => setDedicationText(e.target.value)} rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }} placeholder='לדוגמה: "לעילוי נשמת..."'
                      />
                    </div>
                  </div>
                )}

                {answeredOutcome === 'requested_link' && (
                  <div style={cardStyle}>
                    <div style={sectionLabel}>מה הוא אמר שיתרום? (תיעוד ההתחייבות)</div>
                    <textarea
                      value={pledgeDetails} onChange={(e) => setPledgeDetails(e.target.value)} rows={2}
                      style={{ ...inputStyle, resize: 'vertical' }} placeholder='לדוגמה: "אמר שיתרום 500 ₪ עד סוף השבוע"'
                    />
                  </div>
                )}

                {answeredOutcome && (
                  <>
                    {stages.length > 0 && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4, color: 'var(--text-secondary)' }}>סטטוס</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                          {stages.map((s) => <option key={s.stageKey} value={s.stageKey}>{s.label}</option>)}
                        </select>
                      </div>
                    )}

                    <button
                      type="button" onClick={handleSaveAnswered} disabled={isPending || (answeredOutcome === 'call_back' && !callbackAt)}
                      style={{ ...primaryBtn, fontSize: 14, padding: '12px 20px', borderRadius: 10 }}
                    >
                      שמור והתקדם
                    </button>
                  </>
                )}
              </div>
            )}

            {error && <div style={{ fontSize: 12, color: '#c62828' }}>{error}</div>}

            {phase !== 'confirming' && (
              <button type="button" onClick={handleSkip} disabled={isPending} style={{ ...btnStyle, alignSelf: 'flex-start' }}>דלג</button>
            )}
          </div>

          {/* עמודת כרטיס-קשר לקריאה בלבד */}
          <div style={{ flex: '1 1 45%', padding: '20px 24px', overflowY: 'auto' }}>
            <ContactSummaryPanel contact={contact} />
          </div>
        </div>
      </div>

      {showWhatsApp && (
        <WhatsAppSendModal
          contactId={contact.contactId} workspaceId={workspaceId} phone={contact.phone}
          templates={whatsappTemplates} onClose={() => setShowWhatsApp(false)}
        />
      )}
    </div>
  );
}
