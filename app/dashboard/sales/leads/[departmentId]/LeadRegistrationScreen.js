'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import EmailComposeModal from '../../../contacts/[id]/EmailComposeModal';
import WhatsAppSendModal from '../../../contacts/[id]/WhatsAppSendModal';
import SignaturePad from '../../../components/SignaturePad';
import { PersonIcon, CheckIcon, MailIcon, WhatsAppIcon, WarningIcon } from '../../../components/icons';
import { useLeadLock } from './useLeadLock';
import { useClaimPrompt } from './useClaimPrompt';
import ClaimLeadModal from './ClaimLeadModal';
import {
  updateLeadTrack, updateLeadForms, updateLeadPayment, updateLeadSignatures, updateLeadRegistrationAnswer,
  completeLeadRegistration, cancelCoursePurchase, uploadLeadDocumentByAgent, getSignedLeadFileUrl,
  updateLeadPublicToken, ensureLeadShortCode, submitLeadSignatureByAgent, ensureLeadPaymentRef, recheckKesherPayment, startRegistration,
} from './leadChecklistActions';
import { buildPersonalPaymentUrl } from '../../../../../lib/kesher/paymentLink';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const cardStyle = { background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };
const sendBtnStyle = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--k-border)', borderRadius: 8, background: 'var(--k-surface)', color: 'var(--k-text)', cursor: 'pointer', flexShrink: 0,
};

// מה אפשר לשלוח ללקוח בקישור: הכול (פרטים ואחריהם תשלום), פרטים בלבד, או תשלום בלבד.
const SEND_MODES = [
  { key: 'all', title: 'הכול בקישור אחד', hint: 'הלקוח ממלא פרטים ואז עובר לתשלום' },
  { key: 'details', title: 'פרטים בלבד', hint: 'מילוי פרטים, בלי תשלום' },
  { key: 'pay', title: 'תשלום בלבד', hint: 'מעבר ישיר לדף התשלום' },
];

// פריסת המסך: סרגל צד לצד שלבים. בצר (נייד, או שהתוכן לא נכנס בשורה) הסרגל
// עובר מעל השלבים וכפתור הסיום יורד לתחתית; הסרגל נדבק רק כשיש מקום לשני הצדדים.
const REG_LAYOUT_CSS = `
.reg-layout{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.reg-aside{flex:1 1 280px;min-width:0}
.reg-main{flex:3 1 480px;min-width:0}
.reg-finish-aside{display:none}
.reg-finish-main{display:block}
@media (min-width:1100px){
  .reg-aside{position:sticky;top:12px;max-width:340px}
  .reg-finish-aside{display:block}
  .reg-finish-main{display:none}
}`;

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
  sendConnections = [], whatsappTemplates = [], emailTemplates = [], sentWhatsapp = [], existingPurchase = null, stageKey = null,
  userId = null, agentId = null, sellsCourses = false,
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
  const [shortCode, setShortCode] = useState(checklist?.short_code || null);
  const [sendMode, setSendMode] = useState('all');
  // null = ברירת מחדל: נפתח רק השלב הראשון שעוד לא הושלם.
  const [openSteps, setOpenSteps] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const publicLinkLastOpenedAt = checklist?.public_link_last_opened_at || null;

  // קישור תשלום אישי (migration 0187) - מזהה אטום לליד, נשלח לדף התשלום של
  // קשר ומאפשר לזהות את העסקה בסנכרון בוודאות (ר' lib/kesher/paymentLink.js).
  const [paymentRef, setPaymentRef] = useState(checklist?.payment_ref || null);
  const [paymentRefCreating, setPaymentRefCreating] = useState(false);
  const [paymentRefError, setPaymentRefError] = useState('');
  const [personalPayCopied, setPersonalPayCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  const [, startTransition] = useTransition();
  const [rechecking, setRechecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState('');

  // כללי השלב של מסך הרישום (ר' app/dashboard/lib/leadStageRules.js):
  //  - שמירה מכוונת ראשונה <- "בתהליך הרשמה" + הודעה שנעלמת לבד;
  //  - ליד בלי נציג <- חלון "לקחת אחריות" בכל שמירה מכוונת.
  // agentIdLocal/stageLocal הם useState ולכן לא מסתנכרנים לבד אחרי router.refresh.
  const [agentIdLocal, setAgentIdLocal] = useState(agentId || '');
  const [stageLocal, setStageLocal] = useState(stageKey);
  const [stageNotice, setStageNotice] = useState('');
  const registrationStartedRef = useRef(false);
  const { notifyAction, claimOpen, claim, leaveOpen, claimPending, claimError } = useClaimPrompt({
    departmentId, enabled: sellsCourses, userId, agentId: agentIdLocal, stage: stageLocal,
    onClaimed: (res) => {
      setAgentIdLocal(userId);
      if (res?.stage) setStageLocal(res.stage);
      router.refresh();
    },
  });

  // הערכים שהמסך מציג בטעינה (כולל ברירות מחדל מהקורס), כדי ש-blur בלי שינוי
  // לא ייחשב "שמירה מכוונת". מתעדכן בכל שמירה שבה הערך באמת השתנה.
  const lastSavedRef = useRef(null);
  if (lastSavedRef.current === null) {
    const init = {
      'forms.done': String(!!checklist?.forms_done),
      'forms.link': checklist?.forms_link || selectedCourse?.registration_form_url || '',
      'forms.sentAt': checklist?.forms_sent_at || '',
      'payment.arranged': String(!!checklist?.payment_arranged),
      'payment.totalAmount': checklist?.payment_total_amount != null ? String(checklist.payment_total_amount) : '',
      'payment.installmentsCount': checklist?.payment_installments_count != null ? String(checklist.payment_installments_count) : '1',
      'payment.method': checklist?.payment_method || '',
      'payment.note': checklist?.payment_note || '',
      'payment.paymentLink': checklist?.payment_link || selectedCourse?.payment_page_url || '',
      'payment.paymentLinkSentAt': checklist?.payment_link_sent_at || '',
      'signatures.done': String(!!checklist?.signatures_done),
      'signatures.link': checklist?.signatures_link || selectedCourse?.signature_template_url || '',
      'signatures.note': checklist?.signatures_note || '',
      'signatures.sentAt': checklist?.signatures_sent_at || '',
    };
    for (const [k, v] of Object.entries(checklist?.registration_answers || {})) init[`answers.${k}`] = v === null || v === undefined ? '' : String(v);
    lastSavedRef.current = init;
  }

  // האם אחד מהערכים בתיקון שונה ממה שנשמר לאחרונה (ומעדכן את הרשומה).
  function trackChanges(scope, patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      const key = `${scope}.${k}`;
      const next = v === null || v === undefined ? '' : String(v);
      if (lastSavedRef.current[key] !== next) { lastSavedRef.current[key] = next; changed = true; }
    }
    return changed;
  }

  // נקראת אחרי שמירה מכוונת שבה משהו באמת השתנה (ר' trackChanges), אחרי
  // העלאת מסמך, חתימה ושליחת קישור. מציעה לקחת אחריות, ומעבירה (פעם אחת
  // בטעינה; בשרת זה idempotent) את השלב ל"בתהליך הרשמה".
  function markDeliberateSave() {
    notifyAction();
    if (!sellsCourses || registrationStartedRef.current) return;
    registrationStartedRef.current = true;
    startRegistration(departmentId).then((res) => {
      if (res?.error) { registrationStartedRef.current = false; return; }
      if (res?.changed) {
        setStageLocal(res.stage);
        setStageNotice(`התהליך עבר לשלב "${res.stageLabel}"`);
        setTimeout(() => setStageNotice(''), 6000);
        router.refresh();
      }
    }).catch(() => { registrationStartedRef.current = false; });
  }

  useEffect(() => { setOrigin(window.location.origin); }, []);

  // ממתינים לתשלום שנשלח בקישור האישי: בודקים מחדש אחת לכמה זמן (הסנכרון
  // מול קשר רץ כל כמה דקות, והעסקה מופיעה כאן ברגע שהיא נקלטת).
  const awaitingPayment = !!paymentRef && !!paymentLinkSentAt && paymentMatch?.kind !== 'exact';

  // "שינוי בסכום": הלקוח יכול לערוך את הסכום בדף התשלום של קשר, וקשר לא
  // שומרת אצלה את המזהה האישי - לכן משווים את מה ששולם בפועל למה שסוכם
  // (הסכום בשדה, ובהיעדרו מחיר הקורס). אזהרה בלבד, לא חסימה ולא אישור
  // אוטומטי - הנציג מחליט.
  const expectedAmount = Number(paymentTotal) > 0
    ? Number(paymentTotal)
    : (Number(selectedCourse?.price) > 0 ? Number(selectedCourse.price) : null);
  const paidAmount = paymentMatch ? Number(paymentMatch.amount) : null;
  const amountMismatch = paidAmount != null && expectedAmount != null && Math.abs(paidAmount - expectedAmount) > 0.009;
  useEffect(() => {
    if (!awaitingPayment) return undefined;
    const timer = setInterval(() => router.refresh(), 45000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingPayment]);

  // טוקן הקישור הארוך נוצר בפתיחה אם חסר, ואחריו הקישור הקצר (/r /d /p).
  // אם עמודת הקישור הקצר עוד לא קיימת (migration 0190) מציגים את הארוך.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token = publicToken;
      if (!token) {
        setTokenCreating(true);
        const res = await updateLeadPublicToken(departmentId);
        setTokenCreating(false);
        if (res?.token) { token = res.token; if (!cancelled) setPublicToken(res.token); }
      }
      if (token && !shortCode) {
        const sc = await ensureLeadShortCode(departmentId);
        if (!cancelled && sc?.code) setShortCode(sc.code);
      }
    })();
    return () => { cancelled = true; };
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

  const emailConnection = sendConnections.find((c) => c.workspace_id === workspaceId);
  const canEmail = !!emailConnection && !!contact.email;
  const canWhatsapp = !!contact.phone;

  function handleTrackChange(e) {
    const value = e.target.value;
    setTrackId(value);
    startTransition(() => updateLeadTrack(departmentId, value || null));
    markDeliberateSave();
  }

  function saveForms(patch) {
    startTransition(() => updateLeadForms(departmentId, patch));
    if (trackChanges('forms', patch)) markDeliberateSave();
  }

  function savePayment(patch) {
    startTransition(() => updateLeadPayment(departmentId, patch));
    if (trackChanges('payment', patch)) markDeliberateSave();
  }

  function saveSignatures(patch) {
    startTransition(() => updateLeadSignatures(departmentId, patch));
    if (trackChanges('signatures', patch)) markDeliberateSave();
  }

  function saveAnswer(fieldKey, value) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    startTransition(() => updateLeadRegistrationAnswer(departmentId, fieldKey, value));
    if (trackChanges('answers', { [fieldKey]: value })) markDeliberateSave();
  }

  function handleDocUploaded(doc) {
    setDocs((prev) => [...prev, doc]);
    markDeliberateSave();
  }

  function handleLinkSent(field, mode) {
    const now = new Date().toISOString();
    if (field === 'customerLink') {
      // קישור תשלום בלבד = מעקב שליחת תשלום; הכול/פרטים = שמירה מכוונת של הרישום.
      if (mode === 'pay') {
        setPaymentLinkSentAt(now);
        savePayment({ paymentLinkSentAt: now });
      } else {
        markDeliberateSave();
      }
    } else if (field === 'forms') {
      setFormsSentAt(now);
      saveForms({ sentAt: now });
    } else if (field === 'signatures') {
      setSignaturesSentAt(now);
      saveSignatures({ sentAt: now });
    } else if (field === 'paymentLink' || field === 'personalPayment') {
      setPaymentLinkSentAt(now);
      savePayment({ paymentLinkSentAt: now });
    }
    // 'personalLink' - אין-שדה-sentAt-ייעודי (אפשר-לשלוח-שוב-בלי-מעקב-
    // נפרד; מצב-ההתקדמות-עצמו, לא-מועד-השליחה, הוא-מה-שחשוב-כאן).
  }

  function handleCopyLink() {
    if (!currentCustomerLink) return;
    navigator.clipboard?.writeText(currentCustomerLink).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  function handleCreatePersonalPayment() {
    setPaymentRefError('');
    setPaymentRefCreating(true);
    startTransition(async () => {
      const res = await ensureLeadPaymentRef(departmentId);
      setPaymentRefCreating(false);
      if (res?.error) { setPaymentRefError(res.error); return; }
      setPaymentRef(res.ref);
    });
  }

  function handleCopyPersonalPayment() {
    if (!personalPaymentUrl) return;
    navigator.clipboard?.writeText(personalPaymentUrl).then(() => {
      setPersonalPayCopied(true);
      setTimeout(() => setPersonalPayCopied(false), 2000);
    });
  }

  function handleRegenerateLink() {
    setTokenCreating(true);
    startTransition(async () => {
      const res = await updateLeadPublicToken(departmentId, { regenerate: true });
      setTokenCreating(false);
      if (res?.token) {
        setPublicToken(res.token);
        setShortCode(null);
        const sc = await ensureLeadShortCode(departmentId);
        if (sc?.code) setShortCode(sc.code);
      }
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
      markDeliberateSave();
      router.refresh();
    });
  }

  // "בדיקה מחדש": שואלת את קשר עכשיו אם הגיע תשלום חדש (במקום לחכות לסנכרון
  // התקופתי), ואז טוענת מחדש את המסך כדי שהתשלום/האזהרה יופיעו מיד.
  function handleRecheck() {
    setRecheckMsg('');
    setRechecking(true);
    startTransition(async () => {
      const res = await recheckKesherPayment(departmentId);
      setRechecking(false);
      if (res?.error) setRecheckMsg(res.error);
      else if (res?.skipped) setRecheckMsg('בדיקה אחרת רצה זה עתה. אפשר לנסות שוב בעוד כמה שניות.');
      else setRecheckMsg(res?.created > 0 ? 'נקלט תשלום חדש.' : 'עדיין לא התקבל תשלום חדש בקשר.');
      router.refresh();
    });
  }

  function handleComplete() {
    setCompleteError('');
    if (amountMismatch && !window.confirm(`הסכום ששולם (₪${paidAmount}) שונה מהסכום שסוכם (₪${expectedAmount}). לסיים את הרישום בכל זאת?`)) return;
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
  // הקישור האישי לתשלום נבנה מקישור הדף הכללי + פרטי הליד + המזהה האישי.
  // null = כתובת הדף אינה תקינה (נבדק רק כשכבר נוצר מזהה).
  const personalPaymentUrl = paymentRef && paymentLink
    ? buildPersonalPaymentUrl(paymentLink, {
      ref: paymentRef, origin, firstName: contact.first, lastName: contact.last, phone: contact.phone, email: contact.email,
      amount: paymentTotal || selectedCourse?.price, installments: paymentInstallments,
    })
    : '';
  const lastOpenedLabel = publicLinkLastOpenedAt ? formatSentAt(publicLinkLastOpenedAt)?.replace('נשלח', 'נפתח לאחרונה') : 'עדיין לא נפתח';

  // מרכז-תוכן-ההודעה לכל-אחד-מ-4-סוגי-הקישור-הנשלחים (טפסים/חתימה/
  // קישור-אישי/קישור-תשלום) - שני-המודאלים-הקיימים (Email/WhatsApp)
  // נפתחים-עם-אותו-תוכן-מוכן-מראש, בלי-מנגנון-שליחה-חדש.
  // intro = משפט הפתיחה המלא של כל סוג קישור - בעבר הורכב "קישור ל" + תווית,
  // מה שהפיק ניסוחים שבורים כמו "קישור לקישור אישי להשלמת הרישום".
  const SEND_FIELD_META = {
    forms: { label: 'טופס הרישום', intro: 'מצורף הקישור למילוי טופס הרישום', value: formsLink },
    signatures: { label: 'חתימה דיגיטלית', intro: 'מצורף הקישור לחתימה דיגיטלית', value: signaturesLink },
    // customerLink: התווית, הנוסח והכתובת נקבעים לפי מצב השליחה שנבחר (למטה).
    customerLink: { label: '', intro: '', value: '' },
    paymentLink: { label: 'דף התשלום', intro: 'מצורף הקישור לדף התשלום', value: paymentLink },
    personalPayment: { label: 'תשלום', intro: 'מצורף הקישור האישי לתשלום', value: personalPaymentUrl || '' },
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

  // ===== מבנה המסך: שלבים עצמאיים שנפתחים בכל סדר + סרגל צד =====
  // כל שלב (מסלול, פרטי הלקוח, מסמכים, חתימה, תשלום) הוא כרטיס מתקפל משלו;
  // אין סדר כפוי (למשל אפשר להסדיר תשלום לפני מילוי הפרטים). הסרגל מציג מה
  // נשאר ומאפשר לשלוח ללקוח קישור אחד (הכול), או פרטים בלבד, או תשלום בלבד.
  const dataFields = formFields.filter((f) => f.type !== 'file' && f.type !== 'signature');
  const fileFields = formFields.filter((f) => f.type === 'file');
  const signatureFields = formFields.filter((f) => f.type === 'signature');
  const doneOf = (list) => list.filter(isFieldDone).length;
  const missingOf = (list) => list.filter((f) => f.required && !isFieldDone(f)).length;

  const steps = [];
  if (courseTracks.length > 0) {
    steps.push({ key: 'track', title: 'מסלול', done: !!trackId, blocking: false, summary: trackId ? (courseTracks.find((t) => t.id === trackId)?.label || 'נבחר') : 'לא נבחר' });
  }
  if (dataFields.length > 0) {
    steps.push({ key: 'details', title: 'פרטי הלקוח', done: doneOf(dataFields) === dataFields.length, blocking: missingOf(dataFields) > 0, summary: `${doneOf(dataFields)}/${dataFields.length}` });
  }
  if (fileFields.length > 0) {
    steps.push({ key: 'docs', title: 'מסמכים', done: doneOf(fileFields) === fileFields.length, blocking: missingOf(fileFields) > 0, summary: `${doneOf(fileFields)}/${fileFields.length}` });
  }
  if (signatureFields.length > 0) {
    steps.push({ key: 'signature', title: 'חתימה', done: signaturesDone, blocking: !signaturesDone && signatureFields.some((f) => f.required), summary: signaturesDone ? 'נחתם' : 'לא נחתם' });
  }
  if (showPayment) {
    steps.push({ key: 'payment', title: 'תשלום', done: paymentArranged, blocking: !paymentArranged, summary: paymentArranged ? 'הוסדר' : 'לא הוסדר' });
  }
  if (showForms) {
    steps.push({ key: 'forms', title: 'טפסים חיצוניים', done: formsDone, blocking: !formsDone, summary: formsDone ? 'בוצע' : 'לא בוצע' });
  }

  const stepsDone = steps.filter((s) => s.done).length;
  const firstOpenKey = (steps.find((s) => !s.done) || steps[0])?.key;
  const isOpen = (key) => (openSteps ? !!openSteps[key] : key === firstOpenKey);
  function toggleStep(key) {
    setOpenSteps((prev) => ({ ...(prev || { [firstOpenKey]: true }), [key]: !isOpen(key) }));
  }
  function goToStep(key) {
    setOpenSteps((prev) => ({ ...(prev || { [firstOpenKey]: true }), [key]: true }));
    setTimeout(() => document.getElementById(`step-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // רק שדות חובה, הסדר תשלום וטפסים חיצוניים (כשהם מוגדרים לקורס) חוסמים
  // סיום; שדה אופציונלי אפשר לדלג עליו (תואם את הבדיקה בשרת).
  const blockers = [
    ...missingRequiredFields.map((f) => f.label),
    ...(showPayment && !paymentArranged ? ['הסדר תשלום'] : []),
    ...(showForms && !formsDone ? ['טפסים חיצוניים'] : []),
  ];
  const canFinish = blockers.length === 0;
  const optionalLeft = formFields.filter((f) => !f.required && !isFieldDone(f)).length;

  // קישורי הלקוח: מקוצר (/r, /d, /p) כשכבר נוצר קוד, אחרת הכתובות הארוכות.
  const longLink = publicToken && origin ? `${origin}/register/${publicToken}` : '';
  const payAvailable = showPayment && /^https?:\/\//i.test(paymentLink || '');
  const customerLinks = {
    all: shortCode && origin ? `${origin}/r/${shortCode}` : longLink,
    details: shortCode && origin ? `${origin}/d/${shortCode}` : (longLink ? `${longLink}?m=details` : ''),
    pay: payAvailable ? (shortCode && origin ? `${origin}/p/${shortCode}` : personalPaymentUrl) : '',
  };
  const currentCustomerLink = customerLinks[sendMode] || '';
  const customerMeta = {
    all: { label: 'השלמת הרישום והתשלום', intro: 'מצורף הקישור להשלמת הרישום ולתשלום' },
    details: { label: 'השלמת פרטי הרישום', intro: 'מצורף הקישור להשלמת פרטי הרישום' },
    pay: { label: 'תשלום', intro: 'מצורף הקישור לתשלום' },
  };
  SEND_FIELD_META.customerLink = { ...customerMeta[sendMode], value: currentCustomerLink };

  function renderDataField(field) {
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
  }

  function renderSignatureField(field) {
    return (
                      <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

  function renderStepBody(key) {
    switch (key) {
      case 'track':
        return (
                <select value={trackId} onChange={handleTrackChange} style={inputStyle}>
                  <option value="">— בחירת מסלול —</option>
                  {courseTracks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
        );
      case 'details':
        return dataFields.map((field) => renderDataField(field));
      case 'docs':
        return fileFields.map((field) => (
          <DocumentRequirementRow
            key={field.id}
            requirement={field}
            uploaded={docs.filter((d) => d.requirement_id === field.id)}
            departmentId={departmentId}
            onUploaded={handleDocUploaded}
          />
        ));
      case 'signature':
        return signatureFields.map((field) => renderSignatureField(field));
      case 'payment':
        return (
          <>
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

                  {/* קישור תשלום אישי: ממלא מראש שם/טלפון/סכום ונושא מזהה
                      אישי, כך שהעסקה בקשר מזוהה בוודאות ולא בהערכה. */}
                  <div style={{ borderTop: '1px solid var(--k-border)', marginTop: 10, paddingTop: 8 }}>
                    <div style={{ ...sectionLabel, marginBottom: 4 }}>קישור תשלום אישי</div>
                    {!paymentRef ? (
                      <>
                        <button
                          type="button" onClick={handleCreatePersonalPayment} disabled={paymentRefCreating || !paymentLink}
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '6px 12px', cursor: paymentLink ? 'pointer' : 'default', opacity: paymentLink ? 1 : 0.5 }}
                        >
                          {paymentRefCreating ? 'יוצר...' : 'יצירת קישור אישי'}
                        </button>
                        <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginTop: 4 }}>
                          {paymentLink
                            ? 'הקישור ימלא מראש שם, טלפון וסכום, ויסמן את התשלום כך שנזהה אותו אוטומטית כשיתקבל.'
                            : 'יש להזין קודם את קישור הדף הכללי למעלה.'}
                        </div>
                      </>
                    ) : personalPaymentUrl ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="text" readOnly value={personalPaymentUrl} style={{ ...inputStyle, fontSize: 11 }} />
                        <button type="button" title="העתקה" onClick={handleCopyPersonalPayment} style={sendBtnStyle}>
                          {personalPayCopied ? '✓' : '⧉'}
                        </button>
                        <button type="button" title="שלח במייל" disabled={!canEmail} onClick={() => setSendTarget({ field: 'personalPayment', channel: 'email' })} style={{ ...sendBtnStyle, opacity: !canEmail ? 0.4 : 1 }}>
                          <MailIcon size={13} />
                        </button>
                        <button type="button" title="שלח בוואטסאפ" disabled={!canWhatsapp} onClick={() => setSendTarget({ field: 'personalPayment', channel: 'whatsapp' })} style={{ ...sendBtnStyle, opacity: !canWhatsapp ? 0.4 : 1 }}>
                          <WhatsAppIcon size={13} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: 'var(--k-danger-text)' }}>הקישור לדף התשלום אינו כתובת תקינה (צריך להתחיל ב-https://).</div>
                    )}
                    {paymentRefError && <div style={{ fontSize: 11.5, color: 'var(--k-danger-text)', marginTop: 4 }}>{paymentRefError}</div>}
                  </div>

                  {paymentMatch?.kind === 'exact' && !amountMismatch && (
                    <div style={{ background: 'var(--k-ok-bg)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--k-ok-text)' }}>
                        <CheckIcon size={12} /> התשלום התקבל ואומת מול קשר
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--k-text)', marginTop: 3 }}>
                        ₪{paymentMatch.amount} · {new Date(paymentMatch.transaction_date).toLocaleDateString('he-IL')}
                        {paymentMatch.external_doc_number ? ` · עסקה ${paymentMatch.external_doc_number}` : ''}
                        {/^https?:\/\//i.test(paymentMatch.receipt_url || '') && (
                          <> · <a href={paymentMatch.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--k-accent)' }}>קבלה</a></>
                        )}
                      </div>
                      {!paymentArranged && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentArranged(true);
                            setPaymentTotal(String(paymentMatch.amount));
                            savePayment({ arranged: true, totalAmount: paymentMatch.amount });
                          }}
                          style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'var(--k-accent)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
                        >
                          אישור: התשלום הסדיר את הרישום
                        </button>
                      )}
                    </div>
                  )}
                  {amountMismatch && (
                    <div style={{ background: 'var(--k-danger-bg)', border: '1px solid var(--k-danger-text)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--k-danger-text)' }}>
                        <WarningIcon size={13} /> שים לב: שינוי בסכום
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--k-text)', marginTop: 3 }}>
                        שולם ₪{paidAmount} במקום ₪{expectedAmount} שסוכם · {new Date(paymentMatch.transaction_date).toLocaleDateString('he-IL')}
                        {paymentMatch.external_doc_number ? ` · עסקה ${paymentMatch.external_doc_number}` : ''}
                        {/^https?:\/\//i.test(paymentMatch.receipt_url || '') && (
                          <> · <a href={paymentMatch.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--k-accent)' }}>קבלה</a></>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginTop: 3, marginBottom: 6 }}>
                        כדאי לברר מול הלקוח. אם זו לא התנועה של הרישום הזה (למשל תשלום אחר של אותו אדם), אפשר להתעלם.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentArranged(true);
                          setPaymentTotal(String(paidAmount));
                          savePayment({ arranged: true, totalAmount: paidAmount });
                        }}
                        style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--k-text)', background: 'var(--k-bg)', border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
                      >
                        אישור בכל זאת: ₪{paidAmount} הוא הסכום שסוכם
                      </button>
                    </div>
                  )}
                  {awaitingPayment && !paymentArranged && (
                    <div style={{ background: 'var(--k-bg)', border: '1px dashed var(--k-border)', borderRadius: 8, padding: '6px 10px', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>
                        {recheckMsg || (amountMismatch ? 'הלקוח שילם שוב? אפשר לבדוק מחדש מול קשר.' : 'ממתין לתשלום. העסקה תופיע כאן ברגע שתתקבל מקשר.')}
                      </span>
                      <button type="button" onClick={handleRecheck} disabled={rechecking} style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-accent)', background: 'none', border: 'none', cursor: rechecking ? 'default' : 'pointer', padding: 0, whiteSpace: 'nowrap', opacity: rechecking ? 0.6 : 1 }}>
                        {rechecking ? 'בודק מול קשר...' : 'בדיקה מחדש'}
                      </button>
                    </div>
                  )}
                  {paymentMatch && paymentMatch.kind !== 'exact' && paymentMatch.kind !== 'mismatch' && !amountMismatch && !paymentArranged && (
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
          </>
        );
      case 'forms':
        return (
          <>
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
              <div style={{ fontSize: 10, color: 'var(--k-text-muted)' }}>שדות הטופס שלנו (פרטים, מסמכים, חתימה) נשלחים ללקוח בקישור האישי.</div>
          </>
        );
      default:
        return null;
    }
  }

  const finishBlock = (
    <div style={{ ...cardStyle, marginBottom: 0, alignItems: 'stretch' }}>
      {blockers.length > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>כדי לסיים צריך להשלים: {blockers.join(', ')}</div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--k-ok-text)' }}>כל מה שחובה הושלם, אפשר לסיים.</div>
      )}
      {optionalLeft > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>
          {optionalLeft === 1 ? 'נשאר פרט אופציונלי אחד' : `נשארו ${optionalLeft} פרטים אופציונליים`} - אפשר לדלג.
        </div>
      )}
      {completeError && <div style={{ fontSize: 12.5, color: 'var(--k-danger-text)' }}>{completeError}</div>}
      <button
        type="button" onClick={handleComplete} disabled={!canFinish || completing}
        style={{
          fontFamily: 'var(--k-font-display)', fontSize: 15, border: 'none', borderRadius: 10, padding: '12px 20px',
          cursor: canFinish && !completing ? 'pointer' : 'default',
          background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', opacity: canFinish ? 1 : 0.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700,
        }}
      >
        <CheckIcon size={16} /> {completing ? 'מבצע...' : `סיום רישום${wonStageLabel ? ` (${wonStageLabel})` : ''}`}
      </button>
    </div>
  );

  return (
    <div style={{ background: 'var(--k-bg)', minHeight: '100%' }}>
      <style>{REG_LAYOUT_CSS}</style>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 48px' }}>
        <div style={{ marginBottom: 16 }}>{headerBlock}</div>

        {stageNotice && (
          <div style={{ padding: '10px 16px', marginBottom: 12, borderRadius: 10, textAlign: 'center', background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', fontSize: 13.5, fontWeight: 700 }}>
            <CheckIcon size={14} /> {stageNotice}
          </div>
        )}
        {amountMismatch && (
          <div style={{ padding: '10px 16px', marginBottom: 12, borderRadius: 10, textAlign: 'center', background: 'var(--k-danger-bg)', color: 'var(--k-danger-text)', fontSize: 13.5, fontWeight: 700 }}>
            <WarningIcon size={14} /> שים לב: שינוי בסכום - שולם ₪{paidAmount} במקום ₪{expectedAmount} שסוכם
          </div>
        )}

        <div className="reg-layout">
          <aside className="reg-aside">
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={sectionLabel}>מה נשאר</div>
                <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', fontWeight: 600 }}>{stepsDone}/{steps.length} הושלמו</div>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--k-pill-bg)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${steps.length ? (stepsDone / steps.length) * 100 : 0}%`, background: 'var(--k-ok-text)', transition: 'width .2s' }} />
              </div>
              {steps.map((s, i) => (
                <button
                  key={s.key} type="button" onClick={() => goToStep(s.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '5px 2px', cursor: 'pointer', textAlign: 'start', color: 'var(--k-text)', font: 'inherit', fontSize: 12.5 }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: s.done ? 'var(--k-ok-bg)' : 'var(--k-pill-bg)', color: s.done ? 'var(--k-ok-text)' : 'var(--k-text-muted)' }}>
                    {s.done ? <CheckIcon size={11} /> : i + 1}
                  </span>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: s.done ? 'var(--k-ok-text)' : s.blocking ? 'var(--k-danger-text)' : 'var(--k-text-muted)' }}>
                    {s.summary}{!s.done && s.blocking ? ' · חובה' : ''}
                  </span>
                </button>
              ))}
              {steps.length === 0 && <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>לקורס הזה אין שלבי רישום מוגדרים.</div>}
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>שליחה ללקוח</div>
              <div role="radiogroup" aria-label="מה לשלוח ללקוח" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SEND_MODES.map((m) => {
                  const disabled = m.key === 'pay' && !payAvailable;
                  const selected = sendMode === m.key;
                  return (
                    <label
                      key={m.key} title={disabled ? 'אין קישור לדף תשלום מוגדר לקורס' : undefined}
                      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, border: `1px solid ${selected ? 'var(--k-accent)' : 'var(--k-border)'}`, background: selected ? 'var(--k-pill-bg)' : 'var(--k-surface)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
                    >
                      <input type="radio" name="send-mode" checked={selected} disabled={disabled} onChange={() => setSendMode(m.key)} style={{ marginTop: 2 }} />
                      <span>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{m.title}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--k-text-muted)' }}>{m.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {(tokenCreating && !publicToken) || !origin ? (
                <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>יוצר קישור...</div>
              ) : currentCustomerLink ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" readOnly value={currentCustomerLink} style={{ ...inputStyle, fontSize: 11 }} />
                  <button type="button" title="העתקה" onClick={handleCopyLink} style={sendBtnStyle}>
                    {copyFeedback ? '✓' : '⧉'}
                  </button>
                  <button type="button" title="שלח במייל" disabled={!canEmail} onClick={() => setSendTarget({ field: 'customerLink', channel: 'email', mode: sendMode })} style={{ ...sendBtnStyle, opacity: !canEmail ? 0.4 : 1 }}>
                    <MailIcon size={13} />
                  </button>
                  <button type="button" title="שלח בוואטסאפ" disabled={!canWhatsapp} onClick={() => setSendTarget({ field: 'customerLink', channel: 'whatsapp', mode: sendMode })} style={{ ...sendBtnStyle, opacity: !canWhatsapp ? 0.4 : 1 }}>
                    <WhatsAppIcon size={13} />
                  </button>
                </div>
              ) : sendMode === 'pay' && payAvailable ? (
                <div>
                  <button
                    type="button" onClick={handleCreatePersonalPayment} disabled={paymentRefCreating}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                  >
                    {paymentRefCreating ? 'יוצר...' : 'יצירת קישור תשלום'}
                  </button>
                  {paymentRefError && <div style={{ fontSize: 11.5, color: 'var(--k-danger-text)', marginTop: 4 }}>{paymentRefError}</div>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>לא ניתן ליצור קישור כרגע.</div>
              )}

              <div style={{ borderTop: '1px solid var(--k-border)', marginTop: 4, paddingTop: 8 }}>
                <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>{lastOpenedLabel}</div>
                {formFields.length > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginTop: 3 }}>שדות הטופס: {doneFieldsCount}/{formFields.length} הושלמו</div>
                )}
                {sentPaymentLink && <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginTop: 3 }}>קישור תשלום: {sentPaymentLink}</div>}
              </div>
              <button type="button" onClick={handleRegenerateLink} disabled={tokenCreating} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--k-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                🔄 רענון קישור (מבטל את הישן)
              </button>
            </div>

            <div className="reg-finish-aside">{finishBlock}</div>
          </aside>

          <main className="reg-main">
            {steps.map((s, i) => (
              <StepCard key={s.key} step={s} number={i + 1} open={isOpen(s.key)} onToggle={() => toggleStep(s.key)}>
                {renderStepBody(s.key)}
              </StepCard>
            ))}
            <div className="reg-finish-main">{finishBlock}</div>
          </main>
        </div>
      </div>

      {sendTarget?.channel === 'email' && emailConnection && (
        <EmailComposeModal
          contactId={contact.id} workspaceId={workspaceId} departmentId={departmentId}
          fromAddress={emailConnection.email_address} toAddress={contact.email}
          firstName={contact.first} templates={emailTemplates} stageKey={stageKey} courseId={selectedCourse?.id || null}
          initialSubject={sendSubject(sendTarget.field)}
          initialBody={`${greetingName},\n\n${SEND_FIELD_META[sendTarget.field].intro}:\n${SEND_FIELD_META[sendTarget.field].value}\n\nתודה,\n${workspaceName || ''}`.trim()}
          onClose={() => setSendTarget(null)}
          onSent={() => handleLinkSent(sendTarget.field, sendTarget.mode)}
        />
      )}
      {sendTarget?.channel === 'whatsapp' && (
        <WhatsAppSendModal
          contactId={contact.id} workspaceId={workspaceId} departmentId={departmentId}
          phone={contact.phone} thread={sentWhatsapp} templates={whatsappTemplates} stageKey={stageKey} courseId={selectedCourse?.id || null}
          initialMessage={`${greetingName}, ${SEND_FIELD_META[sendTarget.field].intro}: ${SEND_FIELD_META[sendTarget.field].value}`}
          onClose={() => setSendTarget(null)}
          onSent={() => handleLinkSent(sendTarget.field, sendTarget.mode)}
        />
      )}

      {claimOpen && (
        <ClaimLeadModal onClaim={claim} onLeaveOpen={leaveOpen} pending={claimPending} error={claimError} />
      )}
    </div>
  );
}

// שלב במסך הרישום: כרטיס מתקפל עצמאי (אין סדר כפוי בין השלבים). הכותרת מציגה
// מספר/וי, שם ותקציר ("2/5", "הוסדר"), ו"חובה" כשחסר משהו שחוסם סיום.
function StepCard({ step, number, open, onToggle, children }) {
  const { key, title, done, blocking, summary } = step;
  return (
    <section id={`step-${key}`} style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, marginBottom: 12, scrollMarginTop: 14 }}>
      <button
        type="button" onClick={onToggle} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start', color: 'var(--k-text)', font: 'inherit' }}
      >
        <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: done ? 'var(--k-ok-bg)' : 'var(--k-pill-bg)', color: done ? 'var(--k-ok-text)' : 'var(--k-text-muted)' }}>
          {done ? <CheckIcon size={13} /> : number}
        </span>
        <span style={{ flex: 1, fontFamily: 'var(--k-font-display)', fontSize: 15 }}>{title}</span>
        <span style={{ fontSize: 12, color: done ? 'var(--k-ok-text)' : blocking ? 'var(--k-danger-text)' : 'var(--k-text-muted)' }}>
          {summary}{!done && blocking ? ' · חובה' : ''}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--k-text-muted)', fontSize: 11 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--k-border)', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
      )}
    </section>
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
