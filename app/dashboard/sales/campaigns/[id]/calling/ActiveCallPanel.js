'use client';

import { useEffect, useState, useTransition } from 'react';
import { logCallAttempt, skipContact, quickNoAnswer, undoLastCallAttempt, heartbeatClaim } from '../callQueueActions';
import { updateContactPhone } from '../../../../contacts/actions';
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
  { key: '', label: 'לא ענה' }, { key: 'busy', label: 'תפוס' }, { key: 'wrong_number', label: 'מספר שגוי' },
  { key: 'voicemail', label: 'תא קולי' },
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

// עיפרון-תיקון-מספר ישירות על הכפתור-החייג (במקום רק בתוך חלון-הוואטסאפ,
// ר' WhatsAppSendModal) - טלפן/ית שרואה מספר לא-תקין (או שלחיצת ה-tel:
// לא עובדת) יכול/ה לתקן בלי לפתוח וואטסאפ בכלל. אותה action בדיוק
// (updateContactPhone), רק תצוגה מקומית משלו.
function EditablePhoneChip({ phone, label, contactId, field, primary, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = draft.trim();
    if (!next || next === phone) { setEditing(false); return; }
    setSaving(true);
    const res = await updateContactPhone(contactId, field, next);
    setSaving(false);
    if (res?.error) { onError(res.error); return; }
    onSaved(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus dir="ltr"
          style={{ fontSize: 13, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', width: 130 }}
        />
        <button type="button" onClick={save} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }} title="שמירה">✓</button>
        <button type="button" onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }} title="ביטול">✕</button>
      </div>
    );
  }

  if (!phone) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {telHref(phone) && (
        <a href={telHref(phone)} style={primary ? { ...primaryBtn, fontSize: 15, padding: '10px 20px', textDecoration: 'none' } : { ...btnStyle, textDecoration: 'none', color: 'inherit' }}>
          📞 {phone}{label ? ` (${label})` : ''}
        </a>
      )}
      <button type="button" onClick={() => { setDraft(phone); setEditing(true); }} title="תיקון מספר" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 4, opacity: 0.55 }}>✏️</button>
    </span>
  );
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
  const [currentPhone, setCurrentPhone] = useState(contact.phone);
  const [currentPhone2, setCurrentPhone2] = useState(contact.phone2);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  // בכוונה רק beforeunload (סגירת-טאב/ניווט-החוצה אמיתיים) - לא
  // visibilitychange. היה כאן גם visibilitychange בעבר, אבל זה שחרר את
  // התפיסה בטעות **מיד** ברגע שהטלפן/ית עוזב/ת את הדפדפן לחייג בפועל
  // (מהנייד האישי, לא דרך המערכת) - "הדף הוסתר" קורה בדיוק אז, הרבה
  // לפני שהשיחה בכלל התחילה, ובזמן שהטלפן/ית עוד "choosing". בפועל זה
  // שחרר כמעט כל כרטיס-פעיל תוך שניות מהפתיחה - בדיוק התופעה שדווחה
  // ("הכרטיס כבר לא נעול אצלך" מיד אחרי פתיחה). חלון-התפוגה של שעה
  // (claim_next_campaign_contact, migration 0132) כבר מכסה נטישה אמיתית
  // (טאב שקרס/לא נסגר) בלי הצורך בשחרור-מיידי-על-הסתרה.
  useEffect(() => {
    function releaseOnHide() {
      if (phase === 'choosing') skipContact(contact.rowId);
    }
    window.addEventListener('beforeunload', releaseOnHide);
    return () => {
      window.removeEventListener('beforeunload', releaseOnHide);
    };
  }, [contact.rowId, phase]);

  // "פעימת-חיים" על התפיסה כל עוד הכרטיס עדיין פתוח בפועל (choosing/
  // answered, לא confirming - שם התפיסה כבר שוחררה ע"י השרת) - מונע מצב
  // שבו כרטיס שבאמת עדיין בעבודה (רק פתוח הרבה זמן) "נגנב" לנציג אחר אחרי
  // 15 הדקות של claim_next_campaign_contact, בזמן שהטלפן/ית המקורי/ת עדיין
  // לא הספיק/ה לשלוח (ר' heartbeatClaim, migration 0119). אם stillClaimed
  // חוזר false - מישהו אחר כבר תפס בפועל, אין טעם להשאיר את הכרטיס פתוח.
  useEffect(() => {
    if (phase === 'confirming') return;
    const interval = setInterval(async () => {
      const res = await heartbeatClaim(contact.rowId);
      if (res && res.stillClaimed === false) {
        setError('התפיסה על איש הקשר הזה כבר לא בתוקף - כנראה נתפס בינתיים ע"י נציג אחר');
        onClose({ stayClosed: true });
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
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
      // מעבירים את rowId כדי שהתפיסה הבאה תדע לדלג עליו - בלי זה, המיון
      // הדטרמיניסטי (order by id) לפעמים תופס מיד את אותו איש-קשר בחזרה,
      // ונראה כאילו "דלג" לא עשה כלום (ר' migration 0108).
      onClose({ skippedRowId: contact.rowId });
    });
  }

  // ✕ בכותרת - סוגר בלי לתפוס איש-קשר הבא (stayClosed), כדי לחזור למסך
  // עם כפתורי הפסקה/סיום-יום - שניהם לא נגישים כשהפאנל הזה פתוח (הוא
  // מודאל מלא-מסך). משחרר את התפיסה בדיוק כמו "דלג".
  function handleCloseWithoutAdvancing() {
    setError('');
    startTransition(async () => {
      const res = await skipContact(contact.rowId);
      if (res.error) { setError(res.error); return; }
      onClose({ stayClosed: true });
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
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border, #e5e5e5)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              {contact.name}
              {contact.isPersonal && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#8a5a00', background: '#fff3d6', border: '1px solid #f0d78c', borderRadius: 20, padding: '2px 8px' }}>
                  🎯 מהרשימה האישית שלך
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{contact.category}</div>
          </div>
          <button
            type="button" onClick={handleCloseWithoutAdvancing} disabled={isPending}
            title="סגירה בלי להתקדם - לצורך הפסקה/סיום יום"
            style={{ background: 'none', border: 'none', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* עמודת פקדי-שיחה */}
          <div style={{ flex: '1 1 55%', padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, borderInlineEnd: '1px solid var(--border, #e5e5e5)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <EditablePhoneChip
                phone={currentPhone} contactId={contact.contactId} field="phone" primary
                onSaved={setCurrentPhone} onError={setError}
              />
              <EditablePhoneChip
                phone={currentPhone2} label="משני" contactId={contact.contactId} field="phone2"
                onSaved={setCurrentPhone2} onError={setError}
              />
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
          contactId={contact.contactId} workspaceId={workspaceId} phone={currentPhone}
          templates={whatsappTemplates} onClose={() => setShowWhatsApp(false)}
          skipRefresh
        />
      )}
    </div>
  );
}
