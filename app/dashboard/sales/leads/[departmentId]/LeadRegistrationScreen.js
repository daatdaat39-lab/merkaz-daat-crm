'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import EmailComposeModal from '../../../contacts/[id]/EmailComposeModal';
import WhatsAppSendModal from '../../../contacts/[id]/WhatsAppSendModal';
import ThreeColumnScreen from '../../../components/ThreeColumnScreen';
import SignaturePad from '../../../components/SignaturePad';
import { PersonIcon, CheckIcon, MailIcon, WhatsAppIcon } from '../../../components/icons';
import { useLeadLock } from './useLeadLock';
import {
  updateLeadTrack, updateLeadForms, updateLeadPayment, updateLeadSignatures, updateLeadRegistrationAnswer,
  completeLeadRegistration, cancelCoursePurchase, uploadLeadDocumentByAgent, getSignedLeadFileUrl,
  updateLeadPublicToken, submitLeadSignatureByAgent,
} from './leadChecklistActions';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const cardStyle = { background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };
const sendBtnStyle = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--k-border)', borderRadius: 8, background: 'var(--k-surface)', color: 'var(--k-text)', cursor: 'pointer', flexShrink: 0,
};

function formatSentAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `נשלח ${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

// מסך-רישום נפרד (route חדש) - "שלב 2" של טיפול-בליד: טופס-שדות-מאוחד
// (migration 0182 - טקסט/מספר/תאריך/בחירה/קובץ/חתימה, בסדר-אחד-גמיש,
// לא-3-בלוקים-קבועים-כמו-בעבר) + טפסים-חיצוניים/תשלום + אישור-המרה
// מפורש בכפתור-נפרד-ומודגש. משתמש-באותה-נעילה (useLeadLock) כמו
// LeadWorkScreen - אותו-ליד, שני-מסכים.
export default function LeadRegistrationScreen({
  departmentId, contact, workspaceId, workspaceName, selectedCourse, courseTracks = [], formFields = [],
  uploadedDocuments = [], checklist = null, wonStageLabel, paymentMatch = null,
  sendConnections = [], whatsappTemplates = [], emailTemplates = [], existingPurchase = null,
}) {
  const { lockState, error: lockError, releaseOnNavigate } = useLeadLock(departmentId);
  const router = useRouter();

  const [trackId, setTrackId] = useState(checklist?.track_id || '');
  const [formsLink, setFormsLink] = useState(checklist?.forms_link || selectedCourse?.registration_form_url || '');
  const [formsDone, setFormsDone] = useState(!!checklist?.forms_done);
  const [formsSentAt, setFormsSentAt] = useState(checklist?.forms_sent_at || null);
  const [paymentTotal, setPaymentTotal] = useState(checklist?.payment_total_amount != null ? String(checklist.payment_total_amount) : '');
  const [paymentInstallments, setPaymentInstallments] = useState(checklist?.payment_installments_count != null ? String(checklist.payment_installments_count) : '1');
  const [paymentMethod, setPaymentMethod] = useState(checklist?.payment_method || '');
  const [paymentNote, setPaymentNote] = useState(checklist?.payment_note || '');
  const [paymentArranged, setPaymentArranged] = useState(!!checklist?.payment_arranged);
  const [paymentLink, setPaymentLink] = useState(checklist?.payment_link || selectedCourse?.payment_page_url || '');
  const [paymentLinkSentAt, setPaymentLinkSentAt] = useState(checklist?.payment_link_sent_at || null);
  const [signaturesLink, setSignaturesLink] = useState(checklist?.signatures_link || selectedCourse?.signature_template_url || '');
  const [signaturesNote, setSignaturesNote] = useState(checklist?.signatures_note || '');
  const [signaturesDone, setSignaturesDone] = useState(!!checklist?.signatures_done);
  const [signaturesSentAt, setSignaturesSentAt] = useState(checklist?.signatures_sent_at || null);
  const [signatureImagePath, setSignatureImagePath] = useState(checklist?.signature_image_path || null);
  const [signatureTypedName, setSignatureTypedName] = useState(checklist?.signature_typed_name || null);
  const [signatureIp, setSignatureIp] = useState(checklist?.signature_ip || null);
  const [signatureSignedAt, setSignatureSignedAt] = useState(checklist?.signatures_done_at || null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureSubmitting, setSignatureSubmitting] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [answers, setAnswers] = useState(checklist?.registration_answers || {});
  const [docs, setDocs] = useState(uploadedDocuments);

  // קישור-אישי-ציבורי ללקוח (migration 0181) - נוצר-עצלנית ב-mount אם-
  // חסר (לא-בלחיצה-בלבד) כדי-שהכרטיס-יוכל-להציג-אותו-מיד-בטעינה-ראשונה,
  // אבל-לא-נכתב-בשרת (loader) כדי-שלא-ליצור-טוקן-לכל-ליד-שנפתח-פעם-אחת.
  const [publicToken, setPublicToken] = useState(checklist?.public_token || null);
  const [tokenCreating, setTokenCreating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const publicLinkLastOpenedAt = checklist?.public_link_last_opened_at || null;

  const [, startTransition] = useTransition();

  useEffect(() => {
    if (publicToken || tokenCreating) return;
    setTokenCreating(true);
    updateLeadPublicToken(departmentId).then((res) => {
      setTokenCreating(false);
      if (res?.token) setPublicToken(res.token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 'forms' | 'signatures' | 'personalLink' | 'paymentLink' - איזה-שדה-
  // קישור מפעיל כרגע את חלון-השליחה; ('email'|'whatsapp') - איזה ערוץ.
  const [sendTarget, setSendTarget] = useState(null);

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const showForms = selectedCourse?.checklist_forms_enabled !== false;
  const showPayment = selectedCourse?.checklist_payment_enabled !== false;

  // "בוצע" לכל-type לפי-איפה-שהוא-בפועל-מאוחסן - טקסט/מספר/תאריך/בחירה
  // ב-registration_answers, קובץ ב-contact_documents, חתימה בדגל-היחיד
  // הקיים (lead_conversion_checklist.signatures_done) - שלושת-המנגנונים
  // נשארים-בדיוק-כמו-שהם, רק-ה**רשימה**-שמגדירה-אותם-התאחדה.
  function isFieldDone(field) {
    if (field.type === 'file') return docs.some((d) => d.requirement_id === field.id);
    if (field.type === 'signature') return signaturesDone;
    const v = answers[field.field_key];
    return v !== undefined && v !== null && v !== '';
  }

  const doneFieldsCount = formFields.filter(isFieldDone).length;
  const missingRequiredFields = formFields.filter((f) => f.required && !isFieldDone(f));

  const sectionsTotal = (showForms ? 1 : 0) + (showPayment ? 1 : 0) + formFields.length;
  const sectionsDone = (showForms && formsDone ? 1 : 0) + (showPayment && paymentArranged ? 1 : 0) + doneFieldsCount;
  const allDone = sectionsTotal === 0 || sectionsDone === sectionsTotal;

  const emailConnection = sendConnections.find((c) => c.workspace_id === workspaceId);
  const canEmail = !!emailConnection && !!contact.email;
  const canWhatsapp = !!contact.phone;

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

  function saveAnswer(fieldKey, value) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    startTransition(() => updateLeadRegistrationAnswer(departmentId, fieldKey, value));
  }

  function handleDocUploaded(doc) {
    setDocs((prev) => [...prev, doc]);
  }

  function handleLinkSent(field) {
    const now = new Date().toISOString();
    if (field === 'forms') {
      setFormsSentAt(now);
      saveForms({ sentAt: now });
    } else if (field === 'signatures') {
      setSignaturesSentAt(now);
      saveSignatures({ sentAt: now });
    } else if (field === 'paymentLink') {
      setPaymentLinkSentAt(now);
      savePayment({ paymentLinkSentAt: now });
    }
    // 'personalLink' - אין-שדה-sentAt-ייעודי (אפשר-לשלוח-שוב-בלי-מעקב-
    // נפרד; מצב-ההתקדמות-עצמו, לא-מועד-השליחה, הוא-מה-שחשוב-כאן).
  }

  function handleCopyLink() {
    if (!publicToken) return;
    navigator.clipboard?.writeText(personalLinkUrl).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  function handleRegenerateLink() {
    setTokenCreating(true);
    startTransition(async () => {
      const res = await updateLeadPublicToken(departmentId, { regenerate: true });
      setTokenCreating(false);
      if (res?.token) setPublicToken(res.token);
    });
  }

  function handleSubmitSignature({ typedName, agreed, imageDataUrl }) {
    setSignatureError('');
    setSignatureSubmitting(true);
    startTransition(async () => {
      const res = await submitLeadSignatureByAgent(departmentId, { typedName, agreed, imageDataUrl });
      setSignatureSubmitting(false);
      if (res?.error) { setSignatureError(res.error); return; }
      // מעדכן state-מקומי ישירות מהתשובה - useState-הראשוני (מ-checklist
      // prop) לא-מתעדכן-לבד מ-router.refresh() בלי-remount לקומפוננטה.
      setSignaturesDone(true);
      setSignatureImagePath(res.path);
      setSignatureTypedName(res.typedName);
      setSignatureIp(null);
      setSignatureSignedAt(res.signedAt);
      setShowSignaturePad(false);
      router.refresh();
    });
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

  // ביטול-רישום (קליק-בטעות על "תלמיד פעיל" וכדומה, ר' דיון "תקלה
  // במעבר-שלב") - מסמן status='cancelled' בלבד, לא-מוחק. בכוונה **לא**
  // משנה-שלב (הוכרע-להשאיר-ידני) - הנציג בוחר-שלב-חדש בעצמו דרך-הפס
  // בכרטיס-איש-קשר, והמסך-הזה חוזר-להיות-זמין-לרישום-מחדש.
  function handleCancelPurchase() {
    setCancelError('');
    setCancelling(true);
    startTransition(async () => {
      const res = await cancelCoursePurchase(departmentId, existingPurchase.id);
      setCancelling(false);
      if (res?.error) { setCancelError(res.error); return; }
      router.refresh();
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

  const sentForms = formatSentAt(formsSentAt);
  const sentSignatures = formatSentAt(signaturesSentAt);
  const sentPaymentLink = formatSentAt(paymentLinkSentAt);
  const personalLinkUrl = publicToken && typeof window !== 'undefined' ? `${window.location.origin}/register/${publicToken}` : '';
  const lastOpenedLabel = publicLinkLastOpenedAt ? formatSentAt(publicLinkLastOpenedAt)?.replace('נשלח', 'נפתח לאחרונה') : 'עדיין לא נפתח';

  // מרכז-תוכן-ההודעה לכל-אחד-מ-4-סוגי-הקישור-הנשלחים (טפסים/חתימה/
  // קישור-אישי/קישור-תשלום) - שני-המודאלים-הקיימים (Email/WhatsApp)
  // נפתחים-עם-אותו-תוכן-מוכן-מראש, בלי-מנגנון-שליחה-חדש.
  // intro = משפט הפתיחה המלא של כל סוג קישור - בעבר הורכב "קישור ל" + תווית,
  // מה שהפיק ניסוחים שבורים כמו "קישור לקישור אישי להשלמת הרישום".
  const SEND_FIELD_META = {
    forms: { label: 'טופס הרישום', intro: 'מצורף הקישור למילוי טופס הרישום', value: formsLink },
    signatures: { label: 'חתימה דיגיטלית', intro: 'מצורף הקישור לחתימה דיגיטלית', value: signaturesLink },
    personalLink: { label: 'השלמת הרישום', intro: 'מצורף הקישור האישי להשלמת הרישום', value: personalLinkUrl },
    paymentLink: { label: 'דף התשלום', intro: 'מצורף הקישור לדף התשלום', value: paymentLink },
  };
  // בלי שם פרטי (שדה ריק) - "שלום רב" במקום "שלום ,".
  const greetingName = contact.first?.trim() ? `שלום ${contact.first.trim()}` : 'שלום רב';
  const sendSubject = (field) => [SEND_FIELD_META[field].label, selectedCourse?.name].filter(Boolean).join(' - ');

  const headerBlock = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
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
  );

  // הרשמה-כבר-הושלמה - **לא**-נכנס-ל-3-עמודות (אין-מה-לנהל-שם חוץ-
  // מכפתור-ביטול), אותו-עיקרון-בדיוק כמו lockState==='denied' למעלה -
  // כרטיס-ממורכז-פשוט מחוץ-ל-ThreeColumnScreen.
  if (existingPurchase) {
    return (
      <div style={{ background: 'var(--k-bg)', minHeight: '100%' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px' }}>
          <div style={{ marginBottom: 20 }}>{headerBlock}</div>
          <div style={{ background: 'var(--k-ok-bg)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '20px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--k-ok-text)', marginBottom: 6 }}>
              <CheckIcon size={16} /> ההרשמה כבר הושלמה
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)', marginBottom: 4 }}>
              {new Date(existingPurchase.created_at).toLocaleDateString('he-IL')}
              {existingPurchase.cohort_label ? ` · מסלול: ${existingPurchase.cohort_label}` : ''}
            </div>
            {cancelError && <div style={{ fontSize: 12.5, color: 'var(--k-danger-text)', marginTop: 8 }}>{cancelError}</div>}
            <button
              type="button" onClick={handleCancelPurchase} disabled={cancelling}
              style={{ marginTop: 14, border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, cursor: 'pointer', background: 'var(--k-surface)', color: 'var(--k-text)' }}
            >
              {cancelling ? 'מבטל...' : 'ביטול הרשמה (נלחץ בטעות?)'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--k-bg)', minHeight: '100%' }}>
      <ThreeColumnScreen
        header={headerBlock}
        hero={
          sectionsTotal > 0 && (
            <div style={{ padding: '18px 24px', textAlign: 'center', background: sectionsDone === sectionsTotal ? 'var(--k-ok-bg)' : 'var(--k-pill-bg)' }}>
              <div style={{ ...sectionLabel, color: sectionsDone === sectionsTotal ? 'var(--k-ok-text)' : 'var(--k-text-muted)', opacity: 0.8 }}>התקדמות רישום</div>
              <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, color: sectionsDone === sectionsTotal ? 'var(--k-ok-text)' : 'var(--k-text)', marginTop: 2 }}>
                {sectionsDone}/{sectionsTotal} שלבים הושלמו
              </div>
            </div>
          )
        }
        right={
          <>
            {courseTracks.length > 0 && (
              <div style={cardStyle}>
                <div style={sectionLabel}>מסלול</div>
                <select value={trackId} onChange={handleTrackChange} style={inputStyle}>
                  <option value="">— בחירת מסלול —</option>
                  {courseTracks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            )}

            {/* קישור-אישי-ציבורי ללקוח (migration 0181) - אחד-מאוחד,
                נוצר-עצלנית, עם-מצב-התקדמות-חי כדי-שהנציג יראה-מה-הלקוח-
                כבר-מילא-ואיפה-נעצר גם-אם-לא-סיים (ר' דיון). */}
            <div style={cardStyle}>
              <div style={sectionLabel}>קישור אישי ללקוח</div>
              {tokenCreating && !publicToken ? (
                <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>יוצר קישור...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" readOnly value={personalLinkUrl} style={{ ...inputStyle, fontSize: 11 }} />
                    <button type="button" title="העתקה" onClick={handleCopyLink} style={sendBtnStyle}>
                      {copyFeedback ? '✓' : '⧉'}
                    </button>
                    <button type="button" title="שלח במייל" disabled={!canEmail} onClick={() => setSendTarget({ field: 'personalLink', channel: 'email' })} style={{ ...sendBtnStyle, opacity: !canEmail ? 0.4 : 1 }}>
                      <MailIcon size={13} />
                    </button>
                    <button type="button" title="שלח בוואטסאפ" disabled={!canWhatsapp} onClick={() => setSendTarget({ field: 'personalLink', channel: 'whatsapp' })} style={{ ...sendBtnStyle, opacity: !canWhatsapp ? 0.4 : 1 }}>
                      <WhatsAppIcon size={13} />
                    </button>
                  </div>
                  <button type="button" onClick={handleRegenerateLink} disabled={tokenCreating} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--k-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    🔄 רענון קישור (מבטל את הישן)
                  </button>

                  <div style={{ borderTop: '1px solid var(--k-border)', marginTop: 4, paddingTop: 8 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>{lastOpenedLabel}</div>
                    {formFields.length > 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginTop: 3 }}>שדות הטופס: {doneFieldsCount}/{formFields.length} הושלמו</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {showPayment && (
              <div style={cardStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={paymentArranged}
                    onChange={(e) => { setPaymentArranged(e.target.checked); savePayment({ arranged: e.target.checked }); }}
                  />
                  הסדר תשלומים
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)' }}>
                  תיעודי בלבד כרגע - לא יוצר תהליך-גבייה פעיל. הסכום כאן ישמש כמחיר-הרישום הסופי.
                </div>

                <div style={{ borderTop: '1px solid var(--k-border)', marginTop: 4, paddingTop: 8 }}>
                  <div style={{ ...sectionLabel, marginBottom: 4 }}>קישור לדף תשלום (Kesher)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text" value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)}
                      onBlur={() => savePayment({ paymentLink })}
                      placeholder="קישור לדף תשלום חיצוני" style={inputStyle}
                    />
                    <button type="button" title="שלח במייל" disabled={!canEmail || !paymentLink} onClick={() => setSendTarget({ field: 'paymentLink', channel: 'email' })} style={{ ...sendBtnStyle, opacity: !canEmail || !paymentLink ? 0.4 : 1 }}>
                      <MailIcon size={13} />
                    </button>
                    <button type="button" title="שלח בוואטסאפ" disabled={!canWhatsapp || !paymentLink} onClick={() => setSendTarget({ field: 'paymentLink', channel: 'whatsapp' })} style={{ ...sendBtnStyle, opacity: !canWhatsapp || !paymentLink ? 0.4 : 1 }}>
                      <WhatsAppIcon size={13} />
                    </button>
                  </div>
                  {sentPaymentLink && <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginTop: 4 }}>{sentPaymentLink}</div>}
                  {paymentMatch && !paymentArranged && (
                    <div style={{ background: 'var(--k-bg)', border: '1px dashed var(--k-border)', borderRadius: 8, padding: '6px 10px', marginTop: 8 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--k-text)' }}>
                        ✓ נמצאה התאמה אפשרית: ₪{paymentMatch.amount} ב-{new Date(paymentMatch.transaction_date).toLocaleDateString('he-IL')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--k-text-muted)', marginTop: 2, marginBottom: 6 }}>
                        זו רק הצעה - אין אישור תשלום אוטומטי; יש לאשר ידנית שזו אכן התנועה.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentArranged(true);
                          setPaymentTotal(String(paymentMatch.amount));
                          savePayment({ arranged: true, totalAmount: paymentMatch.amount });
                        }}
                        style={{ fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'var(--k-accent)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
                      >
                        ✓ מצאתי את התנועה הזו - זה התשלום
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        }
        center={
          showForms ? (
            <div style={cardStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={formsDone}
                  onChange={(e) => { setFormsDone(e.target.checked); saveForms({ done: e.target.checked }); }}
                />
                מילוי טפסי רישום
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" value={formsLink} onChange={(e) => setFormsLink(e.target.value)}
                  onBlur={() => saveForms({ link: formsLink })}
                  placeholder="קישור לטופס חיצוני (אופציונלי)" style={inputStyle}
                />
                <button type="button" title="שלח במייל" disabled={!canEmail || !formsLink} onClick={() => setSendTarget({ field: 'forms', channel: 'email' })} style={{ ...sendBtnStyle, opacity: !canEmail || !formsLink ? 0.4 : 1 }}>
                  <MailIcon size={13} />
                </button>
                <button type="button" title="שלח בוואטסאפ" disabled={!canWhatsapp || !formsLink} onClick={() => setSendTarget({ field: 'forms', channel: 'whatsapp' })} style={{ ...sendBtnStyle, opacity: !canWhatsapp || !formsLink ? 0.4 : 1 }}>
                  <WhatsAppIcon size={13} />
                </button>
              </div>
              {sentForms && <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)' }}>{sentForms}</div>}
              <div style={{ fontSize: 10, color: 'var(--k-text-muted)' }}>שדות-הטופס (בעמודה-השמאלית) כבר נשלחים גם בקישור האישי.</div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>אין טופס-חיצוני מוגדר לקורס זה.</div>
          )
        }
        left={
          formFields.length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={sectionLabel}>שדות הטופס</div>
                <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', fontWeight: 600 }}>
                  {doneFieldsCount}/{formFields.length} הושלמו
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {formFields.map((field) => {
                  if (field.type === 'file') {
                    return (
                      <DocumentRequirementRow
                        key={field.id}
                        requirement={field}
                        uploaded={docs.filter((d) => d.requirement_id === field.id)}
                        departmentId={departmentId}
                        onUploaded={handleDocUploaded}
                      />
                    );
                  }
                  if (field.type === 'signature') {
                    return (
                      <div key={field.id} style={cardStyle}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          <input
                            type="checkbox" checked={signaturesDone}
                            onChange={(e) => { setSignaturesDone(e.target.checked); saveSignatures({ done: e.target.checked }); }}
                          />
                          {field.label}{field.required && <span style={{ color: 'var(--k-danger-text)' }}> *</span>}
                        </label>

                        {signatureImagePath ? (
                          <SignaturePreview departmentId={departmentId} filePath={signatureImagePath} typedName={signatureTypedName} signedAt={signatureSignedAt} fromPublicLink={!!signatureIp} />
                        ) : showSignaturePad ? (
                          <>
                            <SignaturePad onSubmit={handleSubmitSignature} submitting={signatureSubmitting} />
                            {signatureError && <div style={{ fontSize: 11.5, color: 'var(--k-danger-text)' }}>{signatureError}</div>}
                            <button type="button" onClick={() => setShowSignaturePad(false)} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--k-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              ביטול
                            </button>
                          </>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>הלקוח יחתום בקישור האישי</div>
                            <button type="button" onClick={() => setShowSignaturePad(true)} style={{ fontSize: 11.5, color: 'var(--k-accent)', background: 'none', border: '1px solid var(--k-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                              חתימה כאן ועכשיו
                            </button>
                          </div>
                        )}

                        <div style={{ borderTop: '1px solid var(--k-border)', marginTop: 4, paddingTop: 8 }}>
                          <div style={{ ...sectionLabel, marginBottom: 4 }}>קישור חיצוני (אופציונלי)</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              type="text" value={signaturesLink} onChange={(e) => setSignaturesLink(e.target.value)}
                              onBlur={() => saveSignatures({ link: signaturesLink })}
                              placeholder="קישור לחתימה דיגיטלית (אופציונלי)" style={inputStyle}
                            />
                            <button type="button" title="שלח במייל" disabled={!canEmail || !signaturesLink} onClick={() => setSendTarget({ field: 'signatures', channel: 'email' })} style={{ ...sendBtnStyle, opacity: !canEmail || !signaturesLink ? 0.4 : 1 }}>
                              <MailIcon size={13} />
                            </button>
                            <button type="button" title="שלח בוואטסאפ" disabled={!canWhatsapp || !signaturesLink} onClick={() => setSendTarget({ field: 'signatures', channel: 'whatsapp' })} style={{ ...sendBtnStyle, opacity: !canWhatsapp || !signaturesLink ? 0.4 : 1 }}>
                              <WhatsAppIcon size={13} />
                            </button>
                          </div>
                          {sentSignatures && <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginTop: 4 }}>{sentSignatures}</div>}
                        </div>
                        <input
                          type="text" value={signaturesNote} onChange={(e) => setSignaturesNote(e.target.value)}
                          onBlur={() => saveSignatures({ note: signaturesNote })}
                          placeholder="הערה (אופציונלי)" style={inputStyle}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={field.id}>
                      <div style={{ ...sectionLabel, marginBottom: 4 }}>
                        {field.label}{field.required && <span style={{ color: 'var(--k-danger-text)' }}> *</span>}
                      </div>
                      {field.type === 'select' ? (
                        <select
                          value={answers[field.field_key] ?? ''}
                          onChange={(e) => saveAnswer(field.field_key, e.target.value)}
                          style={inputStyle}
                        >
                          <option value="">— בחירה —</option>
                          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          type={field.type || 'text'}
                          defaultValue={answers[field.field_key] ?? ''}
                          onBlur={(e) => saveAnswer(field.field_key, e.target.value)}
                          style={inputStyle}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>לקורס הזה אין שדות-טופס מוגדרים.</div>
          )
        }
      />

      {/* הפרדה-ויזואלית-מכוונת (קו-מפריד + רווח) בין-3-העמודות לכפתור-
          ההמרה-הסופי - לא-צריך-להיות-ליד-לחיצה-בטעות. אותו-מיקום-בדיוק
          כמו פס-הפעולה-התחתון ב-LeadWorkScreen.js/CaseWorkScreen.js -
          אח-נפרד מתחת-ל-ThreeColumnScreen, לא דרך ה-children prop שלו. */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px 30px' }}>
        <div style={{ borderTop: '2px solid var(--k-border)', marginTop: 20, paddingTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {!allDone && sectionsTotal > 0 && (
            <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>יש להשלים את כל הפריטים למעלה לפני סיום הרישום.</div>
          )}
          {missingRequiredFields.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>
              יש להשלים: {missingRequiredFields.map((f) => f.label).join(', ')}
            </div>
          )}
          {completeError && <div style={{ fontSize: 12.5, color: 'var(--k-danger-text)' }}>{completeError}</div>}
          <button
            type="button" onClick={handleComplete} disabled={(!allDone && sectionsTotal > 0) || missingRequiredFields.length > 0 || completing}
            style={{
              fontFamily: 'var(--k-font-display)', fontSize: 15, border: 'none', borderRadius: 10, padding: '12px 32px', cursor: 'pointer',
              background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', opacity: ((!allDone && sectionsTotal > 0) || missingRequiredFields.length > 0) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700,
            }}
          >
            <CheckIcon size={16} /> {completing ? 'מבצע...' : `סיום רישום${wonStageLabel ? ` (${wonStageLabel})` : ''}`}
          </button>
        </div>
      </div>

      {sendTarget?.channel === 'email' && emailConnection && (
        <EmailComposeModal
          contactId={contact.id} workspaceId={workspaceId} departmentId={departmentId}
          fromAddress={emailConnection.email_address} toAddress={contact.email}
          firstName={contact.first} templates={emailTemplates}
          initialSubject={sendSubject(sendTarget.field)}
          initialBody={`${greetingName},\n\n${SEND_FIELD_META[sendTarget.field].intro}:\n${SEND_FIELD_META[sendTarget.field].value}\n\nתודה,\n${workspaceName || ''}`.trim()}
          onClose={() => setSendTarget(null)}
          onSent={() => handleLinkSent(sendTarget.field)}
        />
      )}
      {sendTarget?.channel === 'whatsapp' && (
        <WhatsAppSendModal
          contactId={contact.id} workspaceId={workspaceId} departmentId={departmentId}
          phone={contact.phone} thread={[]} templates={whatsappTemplates}
          initialMessage={`${greetingName}, ${SEND_FIELD_META[sendTarget.field].intro}: ${SEND_FIELD_META[sendTarget.field].value}`}
          onClose={() => setSendTarget(null)}
          onSent={() => handleLinkSent(sendTarget.field)}
        />
      )}
    </div>
  );
}

// תצוגה-מקדימה-של-חתימה-שכבר-נלכדה - signed URL (bucket פרטי, לעולם-
// לא getPublicUrl) + שם-מוקלד + זמן + תווית-מקור (האם-נלכדה-בקישור-
// הציבורי-ע"י-הלקוח-עצמו, או-ע"י-הנציג כאן-במסך).
function SignaturePreview({ departmentId, filePath, typedName, signedAt, fromPublicLink }) {
  const [url, setUrl] = useState(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getSignedLeadFileUrl(departmentId, filePath);
      if (res?.url) setUrl(res.url);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 10px' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="חתימה" style={{ maxHeight: 60, alignSelf: 'flex-start', background: '#fff', borderRadius: 4 }} />
      ) : (
        <div style={{ fontSize: 11, color: 'var(--k-text-muted)' }}>טוען חתימה...</div>
      )}
      <div style={{ fontSize: 11.5 }}>{typedName}</div>
      <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)' }}>
        {signedAt && new Date(signedAt).toLocaleDateString('he-IL')} · {fromPublicLink ? 'הוגש מהקישור האישי' : 'נלכד ע"י הנציג'}
      </div>
    </div>
  );
}

// שורת-שדה-מסוג-קובץ בתוך-הטופס-המאוחד - העלאה-ישירה-ע"י-הנציג (למשל
// תמונה-שהלקוח שלח-בוואטסאפ-תוך-כדי-השיחה), אותו-דפוס-מיידי כמו
// AvatarUpload.js. contact_documents היא-טבלה-משותפת-לכל-המערכת
// (migration 0180) - אותה-שורה-שמועלית-כאן מופיעה-גם-בטאב-"מסמכים"-
// הכללי בכרטיס-איש-קשר. requirement.id מצביע-עכשיו ל-course_form_fields.
function DocumentRequirementRow({ requirement, uploaded, departmentId, onUploaded }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const inputId = `doc-upload-${requirement.id}`;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const formData = new FormData();
    formData.set('file', file);
    startTransition(async () => {
      const res = await uploadLeadDocumentByAgent(departmentId, requirement.id, formData);
      if (res?.error) { setError(res.error); return; }
      onUploaded({ requirement_id: requirement.id, original_filename: file.name, uploaded_at: new Date().toISOString(), id: `temp-${Date.now()}` });
    });
    e.target.value = '';
  }

  function handleView(filePath) {
    startTransition(async () => {
      const res = await getSignedLeadFileUrl(departmentId, filePath);
      if (res?.url) window.open(res.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5 }}>
          {requirement.label}{requirement.required && <span style={{ color: 'var(--k-danger-text)' }}> *</span>}
        </span>
        <label htmlFor={inputId} style={{ ...sendBtnStyle, width: 'auto', padding: '0 10px', fontSize: 11, cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'מעלה...' : '+ העלאה'}
        </label>
        <input id={inputId} type="file" onChange={handleFileChange} disabled={isPending} style={{ display: 'none' }} />
      </div>
      {error && <div style={{ fontSize: 11, color: 'var(--k-danger-text)' }}>{error}</div>}
      {uploaded.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {uploaded.map((d) => (
            <button
              key={d.id} type="button" onClick={() => d.file_path && handleView(d.file_path)}
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'start', fontSize: 11, color: 'var(--k-accent)', cursor: 'pointer' }}
            >
              📎 {d.original_filename || 'קובץ'} · {new Date(d.uploaded_at).toLocaleDateString('he-IL')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
