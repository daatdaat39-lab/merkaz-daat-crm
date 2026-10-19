'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThreeColumnScreen from '../../../components/ThreeColumnScreen';
import UnifiedTimeline from '../../../components/UnifiedTimeline';
import ContactQuickActions from '../../../components/ContactQuickActions';
import FillSection from '../../../components/FillSection';
import QuickActivityLogForm from '../../../contacts/[id]/QuickActivityLogForm';
import { PersonIcon, SparkleIcon, CheckIcon, CloseXIcon } from '../../../components/icons';
import { updateDepartmentExtraField, updateLeadStage } from '../../../contacts/actions';
import { CLOSE_REASONS } from '../../../components/pipelines';
import { lockLead, heartbeatLeadLock, releaseLeadLock, convertLead } from './leadLockActions';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const cardStyle = { background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };

// מסך-עבודה לטיפול-בליד (שלב 3) - נועל (migration 0148/lockLead) ברגע
// הפתיחה, פעימת-חיים כל 5 דקות, ומשחרר **רק** ב-beforeunload (לא
// visibilitychange - ר' ההערה המתועדת ב-ActiveCallPanel.js על אותה
// סכנה בדיוק: הסתרת-טאב כשהנציג עובר לחייג מהנייד האישי שלו).
export default function LeadWorkScreen({
  departmentId, aiActionText, timelineSummary, contact, department, stageLabel, wonStageLabel, workspaceId, workspaceName,
  courses, playbookItems, whatsappTemplates, emailTemplates = [], sendConnections = [], timelineProps, stages = [], stageLabels = {},
}) {
  const [lockState, setLockState] = useState('checking'); // checking | locked | denied
  const [courseId, setCourseId] = useState(department.extraFields?.course_id || '');
  const [price, setPrice] = useState('');
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState(CLOSE_REASONS[0]);
  const [scriptTag, setScriptTag] = useState('הכל');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    lockLead(departmentId).then((res) => {
      if (cancelled) return;
      if (res?.error || !res?.locked) {
        setLockState('denied');
        setError(res?.error || 'הליד הזה כבר נעול אצל נציג אחר כרגע');
      } else {
        setLockState('locked');
      }
    });
    return () => { cancelled = true; };
  }, [departmentId]);

  useEffect(() => {
    if (lockState !== 'locked') return;
    const interval = setInterval(async () => {
      const res = await heartbeatLeadLock(departmentId);
      if (res && res.stillLocked === false) {
        setLockState('denied');
        setError('הנעילה על הליד הזה כבר לא בתוקף - כנראה נתפס בינתיים ע"י נציג אחר');
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [departmentId, lockState]);

  useEffect(() => {
    function releaseOnHide() {
      if (lockState === 'locked') releaseLeadLock(departmentId);
    }
    window.addEventListener('beforeunload', releaseOnHide);
    return () => window.removeEventListener('beforeunload', releaseOnHide);
  }, [departmentId, lockState]);

  function handleCourseChange(e) {
    const value = e.target.value;
    setCourseId(value);
    startTransition(async () => {
      await updateDepartmentExtraField(departmentId, 'course_id', value || null);
      router.refresh();
    });
  }

  function handleConvert() {
    setError('');
    setConverting(true);
    startTransition(async () => {
      const res = await convertLead(departmentId, { price });
      setConverting(false);
      if (res?.error) { setError(res.error); return; }
      setConverted(true);
      router.refresh();
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
  const courseFiltered = playbookItems.filter((item) => !item.course_id || item.course_id === courseId);
  const scriptTags = useMemo(() => ['הכל', ...Array.from(new Set(courseFiltered.map((i) => i.tag).filter(Boolean)))], [courseFiltered]);
  const filteredPlaybook = scriptTag === 'הכל' ? courseFiltered : courseFiltered.filter((i) => i.tag === scriptTag);

  if (lockState === 'checking') {
    return <div style={{ padding: 24, fontSize: 13 }}>טוען...</div>;
  }

  if (lockState === 'denied') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, marginBottom: 12 }}>⚠ {error}</div>
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
                  href={`/dashboard/contacts/${contact.id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', borderRadius: 100, padding: '3px 11px', textDecoration: 'none' }}
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

            <div style={sectionLabel}>פרטי יצירת קשר</div>
            <div style={{ margin: '8px 0 16px' }}>
              <ContactQuickActions
                contact={{ id: contact.id, first: contact.first, phone: contact.phone, email: contact.email }}
                departments={workspaceId ? [{ workspaceId, workspaceName }] : []}
                sendConnections={sendConnections}
                whatsappTemplates={whatsappTemplates}
                emailTemplates={emailTemplates}
              />
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>קורס</div>
              <select value={courseId} onChange={handleCourseChange} disabled={isPending} style={inputStyle}>
                <option value="">— בחירת קורס —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.price ? ` (₪${c.price})` : ''}</option>)}
              </select>
            </div>

            <FillSection
              contactId={contact.id}
              fields={[
                { key: 'city', label: 'עיר מגורים', currentValue: contact.city },
                { key: 'occupation', label: 'מקצוע', currentValue: contact.occupation },
                { key: 'idnum', label: 'ת.ז (לצורך רישום)', currentValue: contact.idnum },
                { key: 'birth_date', label: 'תאריך לידה', type: 'date', currentValue: contact.birth_date },
              ]}
            />

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
                      borderRadius: 100, padding: '4px 12px', cursor: 'pointer',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--k-border)', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginInlineEnd: 'auto' }}>
                שינוי-שלב רגיל נעשה מהרשימה הראשית; שתי האפשרויות כאן הן סגירה סופית של הליד.
              </span>
              <input
                type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder={selectedCourse?.price ? `₪${selectedCourse.price}` : 'מחיר (אופציונלי)'}
                style={{ ...inputStyle, width: 140 }}
              />
              <button
                type="button" onClick={handleConvert} disabled={!courseId || converting}
                style={{
                  fontFamily: 'var(--k-font-display)', fontSize: 13.5, border: 'none', borderRadius: 100, padding: '8px 18px', cursor: !courseId ? 'default' : 'pointer',
                  background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', opacity: !courseId ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <CheckIcon size={13} /> {converting ? 'מבצע...' : `נרשם ללימודים${wonStageLabel ? ` (${wonStageLabel})` : ''}`}
              </button>
              <button
                type="button" onClick={() => setClosing((v) => !v)}
                style={{ fontFamily: 'var(--k-font-display)', fontSize: 13.5, border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 18px', cursor: 'pointer', background: 'var(--k-surface)', color: 'var(--k-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <CloseXIcon size={13} /> לא רלוונטי
              </button>
            </div>
            {closing && (
              <div style={{ border: '1px dashed var(--k-border)', borderRadius: 10, padding: '10px 14px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--k-surface)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>סיבת-סגירה:</span>
                <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} style={{ fontSize: 12.5, border: '1px solid var(--k-border)', borderRadius: 100, padding: '5px 12px', background: 'var(--k-bg)', color: 'var(--k-text)' }}>
                  {CLOSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={handleCloseNotRelevant} disabled={isPending} style={{ fontSize: 12, fontWeight: 600, background: 'var(--k-text)', color: 'var(--k-bg)', border: 'none', borderRadius: 100, padding: '5px 14px', cursor: 'pointer' }}>
                  אישור סגירה
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
