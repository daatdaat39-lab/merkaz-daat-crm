'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThreeColumnScreen from '../../../components/ThreeColumnScreen';
import UnifiedTimeline from '../../../components/UnifiedTimeline';
import ContactQuickActions from '../../../components/ContactQuickActions';
import DialButton from '../../../components/DialButton';
import LeadFormFieldsQuickFill from './LeadFormFieldsQuickFill';
import QuickActivityLogForm from '../../../contacts/[id]/QuickActivityLogForm';
import { PersonIcon, SparkleIcon, CheckIcon, CloseXIcon } from '../../../components/icons';
import { updateLeadCourse, updateLeadStage, assignAgentForLead } from '../../../contacts/actions';
import { CLOSE_REASONS } from '../../../components/pipelines';
import { convertLead, setRepConfidence } from './leadLockActions';
import { useLeadLock } from './useLeadLock';
import { useClaimPrompt } from './useClaimPrompt';
import ClaimLeadModal from './ClaimLeadModal';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const cardStyle = { background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };

// מסך-עבודה לטיפול-בליד (שלב 3) - נועל (migration 0148/lockLead) ברגע
// הפתיחה, פעימת-חיים כל 5 דקות, ומשחרר **רק** ב-beforeunload (לא
// visibilitychange - ר' ההערה המתועדת ב-ActiveCallPanel.js על אותה
// סכנה בדיוק: הסתרת-טאב כשהנציג עובר לחייג מהנייד האישי שלו).
export default function LeadWorkScreen({
  departmentId, aiActionText, aiConfidence, timelineSummary, contact, department, stageLabel, wonStage, wonStageLabel, workspaceId, workspaceName,
  courses, checklist = null, courseTracks = [], formFields = [], playbookItems, whatsappTemplates, emailTemplates = [], sendConnections = [], timelineProps, stages = [], stageLabels = {}, agents = [],
  userId = null, sellsCourses = false,
}) {
  const { lockState, error: lockError, releaseOnNavigate } = useLeadLock(departmentId);
  const [agentId, setAgentId] = useState(department.agentId || '');
  const [stage, setStage] = useState(department.stage);
  const [stagePending, setStagePending] = useState(false);
  const [repConfidence, setRepConfidenceState] = useState(department.repConfidence || null);
  const [confidencePending, setConfidencePending] = useState(false);
  const [courseId, setCourseId] = useState(department.courseId || '');
  // ברירת-מחדל חד-פעמית מהצ'קליסט שמולא בשלב "פרטים טכניים" (אם יש) -
  // לא useEffect חי בכוונה, כדי שלא-ידרוס עריכה-באמצע של הנציג באותה-טעינה.
  const [price, setPrice] = useState(checklist?.payment_total_amount != null ? String(checklist.payment_total_amount) : '');
  const [cohortLabel, setCohortLabel] = useState(checklist?.course_tracks?.label || '');
  const [enrollmentStartDate, setEnrollmentStartDate] = useState('');
  const [enrollmentEndDate, setEnrollmentEndDate] = useState('');
  const [converting, setConverting] = useState(false);
  // נגזר-מ-department.stage (לא false-קבוע) כדי-שחזרה-מ-מסך-הרישום-הנפרד
  // אחרי-סיום-רישום-שם תציג-נכון את-מסך-ה"הומר" בטעינה-הראשונה - לא-רק-
  // אחרי handleConvert שקורה-באותו-עמוד.
  const [converted, setConverted] = useState(department.stage === wonStage);
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState(CLOSE_REASONS[0]);
  const [scriptTag, setScriptTag] = useState('הכל');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // "לקחת אחריות על הליד?" - קופץ אחרי פעולה אמיתית של הנציג כשהליד עדיין
  // "ליד חדש" בלי נציג (במחלקה שמוכרת קורסים). ה-hook חייב להיות כאן, מעל
  // ה-early returns למטה.
  const { notifyAction, claimOpen, claim, leaveOpen, claimPending, claimError } = useClaimPrompt({
    departmentId, enabled: sellsCourses, userId, agentId, stage,
    onClaimed: (res) => {
      setAgentId(userId);
      if (res?.stage) setStage(res.stage);
      router.refresh();
    },
  });

  // שימוש-חוזר-מלא בשתי-הפעולות-שכבר-עובדות-בלוח-הלידים (LeadTableRow.js)
  // - רק-מוסיפים-את-אותה-בקרה-גם-כאן, כדי-שנציג-לא-יצטרך-לצאת-ממסך-
  // הליד כדי-להעביר-טיפול/להתקדם-שלב (ר' דיון). אחרי השיוך השרת מחזיר
  // את השלב (כלל "שיוך <- פתוח"), כדי שהרשימה הנפתחת תתעדכן מיד.
  function handleAgentChange(e) {
    const value = e.target.value;
    setAgentId(value);
    startTransition(async () => {
      const res = await assignAgentForLead(departmentId, value || null);
      if (res?.stage) setStage(res.stage);
      router.refresh();
    });
  }

  function handleStageChange(e) {
    const value = e.target.value;
    setStage(value);
    setStagePending(true);
    startTransition(async () => {
      await updateLeadStage(departmentId, value);
      setStagePending(false);
      router.refresh();
    });
  }

  function handleCourseChange(e) {
    const value = e.target.value;
    setCourseId(value);
    startTransition(async () => {
      const res = await updateLeadCourse(departmentId, value || null);
      if (!res?.error) notifyAction();
      router.refresh();
    });
  }

  function handleConvert() {
    setError('');
    setConverting(true);
    startTransition(async () => {
      const res = await convertLead(departmentId, { price, cohortLabel, enrollmentStartDate, enrollmentEndDate });
      setConverting(false);
      if (res?.error) { setError(res.error); return; }
      setConverted(true);
      router.refresh();
    });
  }

  function handleSetConfidence(value) {
    const next = repConfidence === value ? null : value; // לחיצה-חוזרת על אותו-ערך מנקה
    setConfidencePending(true);
    setRepConfidenceState(next);
    startTransition(async () => {
      await setRepConfidence(departmentId, next);
      setConfidencePending(false);
    });
  }

  function handleCloseNotRelevant() {
    startTransition(async () => {
      await updateLeadStage(departmentId, 'closed', closeReason);
      setClosing(false);
      router.refresh();
    });
  }

  const selectedCourse = courses.find((c) => c.id === courseId);
  // חושב-כאן (לא-רק-בתוך-מסך-הרישום-הנפרד) כדי-שהקישור-התמיד-זמין-למטה
  // יציג-תקציר-התקדמות בלי-לטעון-את-מסך-הרישום-בכלל.
  const showForms = selectedCourse?.checklist_forms_enabled !== false;
  const showPayment = selectedCourse?.checklist_payment_enabled !== false;
  const showSignatures = selectedCourse?.checklist_signatures_enabled !== false;
  const enabledCount = [showForms, showPayment, showSignatures].filter(Boolean).length;
  const doneCount = [showForms && !!checklist?.forms_done, showPayment && !!checklist?.payment_arranged, showSignatures && !!checklist?.signatures_done].filter(Boolean).length;
  const courseFiltered = playbookItems.filter((item) => !item.course_id || item.course_id === courseId);
  const scriptTags = useMemo(() => ['הכל', ...Array.from(new Set(courseFiltered.map((i) => i.tag).filter(Boolean)))], [courseFiltered]);
  const filteredPlaybook = scriptTag === 'הכל' ? courseFiltered : courseFiltered.filter((i) => i.tag === scriptTag);

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
      <ThreeColumnScreen
        header={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--k-font-display)', fontSize: 22, color: 'var(--k-text)' }}>{contact.first} {contact.last}</span>
                <Link
                  href="/dashboard/sales/leads"
                  onClick={releaseOnNavigate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-text-muted)', background: 'var(--k-pill-bg)', borderRadius: 8, padding: '3px 11px', textDecoration: 'none' }}
                >
                  ← חזרה לרשימת הלידים
                </Link>
                <Link
                  href={`/dashboard/contacts/${contact.id}`}
                  onClick={releaseOnNavigate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', borderRadius: 8, padding: '3px 11px', textDecoration: 'none' }}
                >
                  <PersonIcon size={11} /> כרטיס מלא
                </Link>
              </div>
              <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 3 }}>{workspaceName} · {stageLabel}</div>
            </div>
          </div>
        }
        right={
          <>
            {aiActionText && (
              <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderInlineEnd: '3px solid var(--k-accent)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, marginBottom: 14, display: 'flex', gap: 7, color: 'var(--k-text)' }}>
                <SparkleIcon size={14} style={{ color: 'var(--k-accent)' }} /><span>{aiActionText}</span>
              </div>
            )}

            <div style={cardStyle}>
              <div style={sectionLabel}>שלב</div>
              <select value={stage} onChange={handleStageChange} disabled={stagePending} style={inputStyle}>
                {stages.map((s) => <option key={s} value={s}>{stageLabels[s] || s}</option>)}
              </select>
              <div style={{ ...sectionLabel, marginTop: 6 }}>נציג מטפל</div>
              <select value={agentId} onChange={handleAgentChange} disabled={isPending} style={inputStyle}>
                <option value="">ללא נציג</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* ציון-סבירות-לסגור - הערכת-נציג ידנית (חם/פושר/קר), נפרד-
                בכוונה מהערכת-AI (לא ממוזגים) - ר' דיון "ציון-סבירות-לסגור". */}
            <div style={sectionLabel}>סבירות לסגור (הערכתך)</div>
            <div style={{ display: 'flex', gap: 6, margin: '8px 0 16px' }}>
              {[{ v: 'hot', l: '🔥 חם' }, { v: 'warm', l: '🙂 פושר' }, { v: 'cold', l: '❄️ קר' }].map((opt) => (
                <button
                  key={opt.v} type="button" disabled={confidencePending}
                  onClick={() => handleSetConfidence(opt.v)}
                  style={{
                    flex: 1, fontSize: 12.5, padding: '6px 0', borderRadius: 8, cursor: 'pointer',
                    border: repConfidence === opt.v ? '1px solid var(--k-accent)' : '1px solid var(--k-border)',
                    background: repConfidence === opt.v ? 'var(--k-pill-bg)' : 'var(--k-surface)',
                    color: repConfidence === opt.v ? 'var(--k-accent)' : 'var(--k-text-muted)',
                  }}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            {aiConfidence && (
              <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginTop: -10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon size={11} style={{ color: 'var(--k-accent)' }} />
                הערכת-AI: {aiConfidence === 'hot' ? '🔥 חם' : aiConfidence === 'warm' ? '🙂 פושר' : '❄️ קר'}
              </div>
            )}

            <div style={sectionLabel}>פרטי יצירת קשר</div>
            <div style={{ margin: '8px 0 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ContactQuickActions
                contact={{ id: contact.id, first: contact.first, phone: contact.phone, email: contact.email }}
                departments={workspaceId ? [{ workspaceId, workspaceName }] : []}
                sendConnections={sendConnections}
                whatsappTemplates={whatsappTemplates}
                emailTemplates={emailTemplates}
                departmentId={departmentId}
                stageKey={stage}
                courseId={courseId || null}
                whatsappThread={timelineProps.sentWhatsapp}
                onActionDone={notifyAction}
              />
              {contact.phone && <DialButton contactId={contact.id} workspaceId={workspaceId} onActionDone={notifyAction} />}
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>קורס</div>
              <select value={courseId} onChange={handleCourseChange} disabled={isPending} style={inputStyle}>
                <option value="">— בחירת קורס —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.price ? ` (₪${c.price})` : ''}</option>)}
              </select>
            </div>

            {courseId && (
              <LeadFormFieldsQuickFill departmentId={departmentId} formFields={formFields} answers={checklist?.registration_answers || {}} onSaved={notifyAction} />
            )}

            {error && <div style={{ fontSize: 12, color: 'var(--k-danger-text)', marginTop: 10 }}>{error}</div>}
          </>
        }
        center={
          <>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>ציר זמן</div>
            {timelineSummary && (
              <div style={{ background: 'var(--k-bg)', border: '1px dashed var(--k-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--k-text-muted)', marginBottom: 4 }}>סיכום</div>
                <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--k-text)' }}>{timelineSummary}</div>
              </div>
            )}
            <QuickActivityLogForm
              contactId={contact.id} department={department} stages={stages} labels={stageLabels} frozen={false}
              onSaved={notifyAction}
            />
            <UnifiedTimeline {...timelineProps} />
          </>
        }
        left={
          <>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>תסריטים</div>
            {scriptTags.length > 2 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {scriptTags.map((t) => (
                  <button
                    key={t} type="button" onClick={() => setScriptTag(t)}
                    style={{
                      fontSize: 11.5, border: '1px solid ' + (scriptTag === t ? 'var(--k-text)' : 'var(--k-border)'),
                      background: scriptTag === t ? 'var(--k-text)' : 'none', color: scriptTag === t ? 'var(--k-bg)' : 'var(--k-text-muted)',
                      borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {filteredPlaybook.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>
                {courseId ? 'אין עדיין תסריטים לקורס הזה.' : 'בחר/י קורס כדי לראות תסריטים מותאמים.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredPlaybook.map((item) => (
                  <details key={item.id} style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 10, padding: '10px 12px' }}>
                    <summary style={{ fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--k-text)' }}>
                      {item.title}{item.tag ? ` · ${item.tag}` : ''}
                    </summary>
                    <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{item.body}</div>
                  </details>
                ))}
              </div>
            )}
          </>
        }
      />

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px 30px' }}>
        {converted ? (
          <div style={{ background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', borderRadius: 12, padding: '14px 18px', fontWeight: 600, marginTop: 20 }}>
            🎉 ההרשמה נרשמה! השלב עודכן ל-{wonStageLabel || 'ניצחון'}.
          </div>
        ) : (
          <>
            {/* קישור-תמיד-זמין למסך-הרישום-הנפרד (route חדש) - בלי-תלות-
                בשלב-pipeline-נוכחי, כדי-שאפשר-גם "לדלג-שלבים" וגם-שזה-
                יהיה-חלק-טבעי-מהתהליך. ההמרה-הסופית (ר' למטה) קוראת-שם,
                לא-כאן - ר' דיון "מסך-רישום נפרד". */}
            {courseId && enabledCount > 0 && (
              <div style={{ ...cardStyle, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: doneCount === enabledCount ? 'var(--k-ok-text)' : 'var(--k-text-muted)' }}>
                  פרטי רישום: {doneCount}/{enabledCount} הושלמו
                </span>
                <Link
                  href={`/dashboard/sales/leads/${departmentId}/registration`}
                  onClick={releaseOnNavigate}
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--k-accent)', textDecoration: 'none' }}
                >
                  מעבר לפרטי רישום →
                </Link>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--k-border)', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginInlineEnd: 'auto' }}>
                שינוי-שלב רגיל נעשה מהרשימה הראשית; שתי האפשרויות כאן הן סגירה סופית של הליד.
              </span>
              {/* תחתית-ההמרה-הידנית-הישנה - נשארת **רק** לקורסים-שכיבו-את-
                  כל-3-דגלי-הצ'קליסט (enabledCount===0): אין-להם-מסך-רישום
                  בכלל, אז-זה-עדיין-הנתיב-היחיד-להמרה. אחרת ההמרה-קורית
                  אך-ורק-דרך-מסך-הרישום-הנפרד (כפתור "סיום רישום") - שדה-
                  המחיר-שם (מהצ'קליסט) הוא-מקור-האמת-היחיד, לא-שדה-כפול-כאן. */}
              {enabledCount === 0 && (
                <>
                  {selectedCourse?.duration_type === 'fixed_dates' && (
                    <>
                      <input
                        type="text" value={cohortLabel} onChange={(e) => setCohortLabel(e.target.value)}
                        placeholder="שם מחזור (אופציונלי)"
                        style={{ ...inputStyle, width: 140 }}
                      />
                      <input
                        type="date" value={enrollmentStartDate} onChange={(e) => setEnrollmentStartDate(e.target.value)}
                        title="תאריך התחלה" style={{ ...inputStyle, width: 140 }}
                      />
                      <input
                        type="date" value={enrollmentEndDate} onChange={(e) => setEnrollmentEndDate(e.target.value)}
                        title="תאריך סיום" style={{ ...inputStyle, width: 140 }}
                      />
                    </>
                  )}
                  <input
                    type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                    placeholder={selectedCourse?.price ? `₪${selectedCourse.price}` : 'מחיר (אופציונלי)'}
                    style={{ ...inputStyle, width: 140 }}
                  />
                  <button
                    type="button" onClick={handleConvert} disabled={!courseId || converting}
                    style={{
                      fontFamily: 'var(--k-font-display)', fontSize: 13.5, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: !courseId ? 'default' : 'pointer',
                      background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', opacity: !courseId ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <CheckIcon size={13} /> {converting ? 'מבצע...' : `נרשם ללימודים${wonStageLabel ? ` (${wonStageLabel})` : ''}`}
                  </button>
                </>
              )}
              <button
                type="button" onClick={() => setClosing((v) => !v)}
                style={{ fontFamily: 'var(--k-font-display)', fontSize: 13.5, border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', background: 'var(--k-surface)', color: 'var(--k-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <CloseXIcon size={13} /> לא רלוונטי
              </button>
            </div>
            {closing && (
              <div style={{ border: '1px dashed var(--k-border)', borderRadius: 10, padding: '10px 14px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--k-surface)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>סיבת-סגירה:</span>
                <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} style={{ fontSize: 12.5, border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 12px', background: 'var(--k-bg)', color: 'var(--k-text)' }}>
                  {CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={handleCloseNotRelevant} disabled={isPending} style={{ fontSize: 12, fontWeight: 600, background: 'var(--k-text)', color: 'var(--k-bg)', border: 'none', borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}>
                  אישור סגירה
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {claimOpen && (
        <ClaimLeadModal onClaim={claim} onLeaveOpen={leaveOpen} pending={claimPending} error={claimError} />
      )}
    </div>
  );
}
