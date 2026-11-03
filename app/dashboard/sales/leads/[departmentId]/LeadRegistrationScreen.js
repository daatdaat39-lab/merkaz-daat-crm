'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PersonIcon, CheckIcon } from '../../../components/icons';
import { useLeadLock } from './useLeadLock';
import { updateLeadTrack, updateLeadForms, updateLeadPayment, updateLeadSignatures, completeLeadRegistration } from './leadChecklistActions';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };

// מסך-רישום נפרד (route חדש) - "שלב 2" של טיפול-בליד: טפסים/תשלומים/
// חתימות לפי-הגדרות-הקורס + אישור-המרה מפורש בכפתור-נפרד-ומודגש (לא
// אוטומטי-מהצ'קליסט) - ר' דיון "מסך-רישום נפרד". משתמש-באותה-נעילה
// (useLeadLock) כמו LeadWorkScreen - אותו-ליד, שני-מסכים.
export default function LeadRegistrationScreen({ departmentId, contact, selectedCourse, courseTracks = [], checklist = null, wonStageLabel }) {
  const { lockState, error: lockError, releaseOnNavigate } = useLeadLock(departmentId);
  const router = useRouter();

  const [trackId, setTrackId] = useState(checklist?.track_id || '');
  const [formsLink, setFormsLink] = useState(checklist?.forms_link || '');
  const [formsDone, setFormsDone] = useState(!!checklist?.forms_done);
  const [paymentTotal, setPaymentTotal] = useState(checklist?.payment_total_amount != null ? String(checklist.payment_total_amount) : '');
  const [paymentInstallments, setPaymentInstallments] = useState(checklist?.payment_installments_count != null ? String(checklist.payment_installments_count) : '1');
  const [paymentMethod, setPaymentMethod] = useState(checklist?.payment_method || '');
  const [paymentNote, setPaymentNote] = useState(checklist?.payment_note || '');
  const [paymentArranged, setPaymentArranged] = useState(!!checklist?.payment_arranged);
  const [signaturesNote, setSignaturesNote] = useState(checklist?.signatures_note || '');
  const [signaturesDone, setSignaturesDone] = useState(!!checklist?.signatures_done);
  const [, startTransition] = useTransition();

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const showForms = selectedCourse?.checklist_forms_enabled !== false;
  const showPayment = selectedCourse?.checklist_payment_enabled !== false;
  const showSignatures = selectedCourse?.checklist_signatures_enabled !== false;
  const enabledCount = [showForms, showPayment, showSignatures].filter(Boolean).length;
  const doneCount = [showForms && formsDone, showPayment && paymentArranged, showSignatures && signaturesDone].filter(Boolean).length;
  const allDone = enabledCount > 0 && doneCount === enabledCount;

  function handleTrackChange(e) {
    const value = e.target.value;
    setTrackId(value);
    startTransition(() => updateLeadTrack(departmentId, value || null));
  }

  function saveForms(patch) {
    startTransition(() => updateLeadForms(departmentId, patch));
  }

  function savePayment(patch) {
    startTransition(() => updateLeadPayment(departmentId, patch));
  }

  function saveSignatures(patch) {
    startTransition(() => updateLeadSignatures(departmentId, patch));
  }

  function handleComplete() {
    setCompleteError('');
    setCompleting(true);
    startTransition(async () => {
      const res = await completeLeadRegistration(departmentId);
      setCompleting(false);
      if (res?.error) { setCompleteError(res.error); return; }
      releaseOnNavigate();
      router.push(`/dashboard/sales/leads/${departmentId}`);
    });
  }

  if (lockState === 'checking') {
    return <div style={{ padding: 24, fontSize: 13 }}>טוען...</div>;
  }

  if (lockState === 'denied') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, marginBottom: 12 }}>⚠ {lockError}</div>
        <Link href="/dashboard/sales/leads" style={{ fontSize: 13, color: 'var(--k-accent)' }}>← חזרה לרשימת הלידים</Link>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--k-bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <div>
            <span style={{ fontFamily: 'var(--k-font-display)', fontSize: 20, color: 'var(--k-text)' }}>פרטי רישום · {contact.first} {contact.last}</span>
            <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 3 }}>קורס: {selectedCourse?.name || '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={`/dashboard/sales/leads/${departmentId}`}
              onClick={releaseOnNavigate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-text-muted)', background: 'var(--k-pill-bg)', borderRadius: 8, padding: '3px 11px', textDecoration: 'none' }}
            >
              ← חזרה למסך הליד
            </Link>
            <Link
              href={`/dashboard/contacts/${contact.id}`}
              onClick={releaseOnNavigate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', borderRadius: 8, padding: '3px 11px', textDecoration: 'none' }}
            >
              <PersonIcon size={11} /> כרטיס מלא
            </Link>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={sectionLabel}>פרטים טכניים</div>
          <div style={{ fontSize: 11.5, color: doneCount === enabledCount && enabledCount > 0 ? 'var(--k-ok-text)' : 'var(--k-text-muted)', fontWeight: 600 }}>
            {doneCount}/{enabledCount} הושלם
          </div>
        </div>

        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {courseTracks.length > 0 && (
            <div>
              <div style={{ ...sectionLabel, marginBottom: 4 }}>מסלול</div>
              <select value={trackId} onChange={handleTrackChange} style={inputStyle}>
                <option value="">— בחירת מסלול —</option>
                {courseTracks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          )}

          {showForms && (
            <div style={{ borderTop: '1px solid var(--k-border)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox" checked={formsDone}
                  onChange={(e) => { setFormsDone(e.target.checked); saveForms({ done: e.target.checked }); }}
                />
                מילוי טפסי רישום
              </label>
              <input
                type="text" value={formsLink} onChange={(e) => setFormsLink(e.target.value)}
                onBlur={() => saveForms({ link: formsLink })}
                placeholder="קישור לטופס חיצוני (אופציונלי)" style={inputStyle}
              />
            </div>
          )}

          {showPayment && (
            <div style={{ borderTop: '1px solid var(--k-border)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox" checked={paymentArranged}
                  onChange={(e) => { setPaymentArranged(e.target.checked); savePayment({ arranged: e.target.checked }); }}
                />
                הסדר תשלומים
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <input
                  type="number" value={paymentTotal} onChange={(e) => setPaymentTotal(e.target.value)}
                  onBlur={() => savePayment({ totalAmount: paymentTotal })}
                  placeholder={selectedCourse?.price ? `סכום כולל (₪${selectedCourse.price})` : 'סכום כולל (₪)'} style={{ ...inputStyle, width: 170 }}
                />
                <input
                  type="number" value={paymentInstallments} onChange={(e) => setPaymentInstallments(e.target.value)}
                  onBlur={() => savePayment({ installmentsCount: paymentInstallments })}
                  placeholder="מספר תשלומים" style={{ ...inputStyle, width: 140 }}
                />
                <input
                  type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                  onBlur={() => savePayment({ method: paymentMethod })}
                  placeholder="אמצעי תשלום" style={{ ...inputStyle, width: 140 }}
                />
              </div>
              <input
                type="text" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)}
                onBlur={() => savePayment({ note: paymentNote })}
                placeholder="הערה (אופציונלי)" style={inputStyle}
              />
              <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginTop: 4 }}>
                תיעודי בלבד כרגע - לא יוצר תהליך-גבייה פעיל. הסכום כאן ישמש כמחיר-הרישום הסופי.
              </div>
            </div>
          )}

          {showSignatures && (
            <div style={{ borderTop: '1px solid var(--k-border)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox" checked={signaturesDone}
                  onChange={(e) => { setSignaturesDone(e.target.checked); saveSignatures({ done: e.target.checked }); }}
                />
                חתימות
              </label>
              <input
                type="text" value={signaturesNote} onChange={(e) => setSignaturesNote(e.target.value)}
                onBlur={() => saveSignatures({ note: signaturesNote })}
                placeholder="הערה (אופציונלי)" style={inputStyle}
              />
            </div>
          )}

          {enabledCount === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>
              לקורס הזה כבויים כל פריטי-הצ'קליסט - אפשר לסיים את הרישום ישירות.
            </div>
          )}
        </div>

        {/* הפרדה-ויזואלית-מכוונת (קו-מפריד + רווח) בין-אזור-הצ'קבוקסים
            לכפתור-ההמרה-הסופי - לא-צריך-להיות-ליד-לחיצה-בטעות. */}
        <div style={{ borderTop: '2px solid var(--k-border)', marginTop: 26, paddingTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {!allDone && enabledCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>יש להשלים את כל הפריטים למעלה לפני סיום הרישום.</div>
          )}
          {completeError && <div style={{ fontSize: 12.5, color: 'var(--k-danger-text)' }}>{completeError}</div>}
          <button
            type="button" onClick={handleComplete} disabled={(!allDone && enabledCount > 0) || completing}
            style={{
              fontFamily: 'var(--k-font-display)', fontSize: 15, border: 'none', borderRadius: 10, padding: '12px 32px', cursor: 'pointer',
              background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', opacity: (!allDone && enabledCount > 0) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700,
            }}
          >
            <CheckIcon size={16} /> {completing ? 'מבצע...' : `סיום רישום${wonStageLabel ? ` (${wonStageLabel})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
