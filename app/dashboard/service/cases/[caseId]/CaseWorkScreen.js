'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThreeColumnScreen from '../../../components/ThreeColumnScreen';
import UnifiedTimeline from '../../../components/UnifiedTimeline';
import ContactQuickActions from '../../../components/ContactQuickActions';
import FillSection from '../../../components/FillSection';
import CaseNoteForm from './CaseNoteForm';
import { PersonIcon, SparkleIcon, CheckIcon, TransferIcon } from '../../../components/icons';
import { updateCaseStatus, updateCaseSeverity, assignCaseAgent } from '../actions';

// נופל-חזרה אם לא הוגדרה רשימה דינמית (settings/picklists, list_key='case_close_reason') -
// אותו עיקרון כמו CLOSE_REASONS של לידים ב-components/pipelines.js, רק סט-ברירת-מחדל שונה.
const CASE_CLOSE_REASONS_FALLBACK = ['נפתר', 'לא ניתן לשחזר את הבעיה', 'הלקוח לא הגיב', 'כפול', 'אחר'];
import { lockCase, heartbeatCaseLock, releaseCaseLock } from './caseLockActions';
import { SEVERITY_LABELS, STATUS_LABELS, slaStatus } from '../../../lib/serviceSla';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)' };
const cardStyle = { background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' };

// מסך-עבודה לקריאת-שירות (שלב 4) - נעילה נפרדת-מהליד (migration 0151,
// לא lock_lead) ישירות על service_cases.id. אותה משמעת בדיוק כמו
// LeadWorkScreen.js: heartbeat כל 5 דק', שחרור רק ב-beforeunload.
export default function CaseWorkScreen({
  caseId, aiActionText, timelineSummary, caseData, contact, workspaceName, agents, kbItems, whatsappTemplates, emailTemplates = [], sendConnections = [], workspaceId, timelineProps, closeReasons, caseNotes = [],
}) {
  const [lockState, setLockState] = useState('checking');
  const [status, setStatus] = useState(caseData.status);
  const [severity, setSeverity] = useState(caseData.severity);
  const [assignedTo, setAssignedTo] = useState(caseData.assignedTo || '');
  const [tagFilter, setTagFilter] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const reasons = closeReasons?.length ? closeReasons : CASE_CLOSE_REASONS_FALLBACK;
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState(reasons[0]);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    lockCase(caseId).then((res) => {
      if (cancelled) return;
      if (res?.error || !res?.locked) {
        setLockState('denied');
        setError(res?.error || 'הקריאה הזו כבר נעולה אצל נציג אחר כרגע');
      } else {
        setLockState('locked');
      }
    });
    return () => { cancelled = true; };
  }, [caseId]);

  useEffect(() => {
    if (lockState !== 'locked') return;
    const interval = setInterval(async () => {
      const res = await heartbeatCaseLock(caseId);
      if (res && res.stillLocked === false) {
        setLockState('denied');
        setError('הנעילה על הקריאה הזו כבר לא בתוקף - כנראה נתפסה בינתיים ע"י נציג אחר');
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [caseId, lockState]);

  useEffect(() => {
    function releaseOnHide() {
      if (lockState === 'locked') releaseCaseLock(caseId);
    }
    window.addEventListener('beforeunload', releaseOnHide);
    return () => window.removeEventListener('beforeunload', releaseOnHide);
  }, [caseId, lockState]);

  function handleStatusChange(e) {
    const value = e.target.value;
    setStatus(value);
    startTransition(async () => { await updateCaseStatus(caseId, value); router.refresh(); });
  }
  function handleSeverityChange(e) {
    const value = e.target.value;
    setSeverity(value);
    startTransition(async () => { await updateCaseSeverity(caseId, value); router.refresh(); });
  }
  function handleAgentChange(e) {
    const value = e.target.value;
    setAssignedTo(value);
    startTransition(async () => { await assignCaseAgent(caseId, value || null); router.refresh(); });
  }
  function handleCloseConfirm() {
    startTransition(async () => {
      await updateCaseStatus(caseId, 'closed', closeReason);
      setStatus('closed');
      setClosing(false);
      router.refresh();
    });
  }
  function handleTransferConfirm() {
    startTransition(async () => {
      await assignCaseAgent(caseId, transferTo || null);
      setAssignedTo(transferTo);
      setTransferring(false);
      router.refresh();
    });
  }

  const sla = status === 'closed' ? null : slaStatus(caseData.slaDueAt, severity);
  const relevantKb = kbItems.filter((item) => !item.course_id || item.course_id === caseData.courseId);
  const kbTags = Array.from(new Set(relevantKb.map((i) => i.tag).filter(Boolean)));
  const filteredKb = tagFilter ? relevantKb.filter((i) => i.tag === tagFilter) : relevantKb;
  const relevantTemplates = whatsappTemplates.filter((t) => !t.course_id || t.course_id === caseData.courseId);

  if (lockState === 'checking') {
    return <div style={{ padding: 24, fontSize: 13 }}>טוען...</div>;
  }

  if (lockState === 'denied') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, marginBottom: 12 }}>⚠ {error}</div>
        <Link href="/dashboard/service/cases" style={{ fontSize: 13, color: 'var(--k-accent)' }}>← חזרה לרשימת הקריאות</Link>
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
                <span style={{ fontFamily: 'var(--k-font-display)', fontSize: 22, color: 'var(--k-text)' }}>#{caseData.caseNumber} · {caseData.subject}</span>
                <Link
                  href={`/dashboard/contacts/${contact.id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', borderRadius: 8, padding: '3px 11px', textDecoration: 'none' }}
                >
                  <PersonIcon size={11} /> כרטיס מלא
                </Link>
              </div>
              <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 3 }}>{contact.first} {contact.last} · {workspaceName}</div>
            </div>
          </div>
        }
        hero={
          sla && (
            <div style={{ padding: '22px 24px', textAlign: 'center', background: sla.bg }}>
              <div style={{ ...sectionLabel, color: sla.color, opacity: 0.8 }}>SLA</div>
              <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 34, color: sla.color, marginTop: 2 }}>{sla.label}</div>
            </div>
          )
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
                whatsappTemplates={relevantTemplates}
                emailTemplates={emailTemplates}
              />
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>סטטוס</div>
              <select value={status} onChange={handleStatusChange} disabled={isPending} style={inputStyle}>
                {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>חומרה</div>
              <select value={severity} onChange={handleSeverityChange} disabled={isPending} style={inputStyle}>
                {Object.entries(SEVERITY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>נציג מטפל</div>
              <select value={assignedTo} onChange={handleAgentChange} disabled={isPending} style={inputStyle}>
                <option value="">ללא נציג</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <FillSection
              contactId={contact.id}
              fields={[
                { key: 'city', label: 'עיר מגורים', currentValue: contact.city },
                { key: 'occupation', label: 'מקצוע', currentValue: contact.occupation },
                { key: 'idnum', label: 'ת.ז', currentValue: contact.idnum },
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
            <CaseNoteForm caseId={caseId} />
            {caseNotes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {caseNotes.map((n) => (
                  <div key={n.id} style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 10, padding: '9px 12px' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--k-text)', whiteSpace: 'pre-wrap' }}>{n.note}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginTop: 4 }}>
                      {n.authorName ? `${n.authorName} · ` : ''}{new Date(n.createdAt).toLocaleDateString('he-IL')} {new Date(n.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <UnifiedTimeline {...timelineProps} />
          </>
        }
        left={
          <>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>מאגר ידע</div>
            {kbTags.length > 0 && (
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
                <option value="">כל הסוגים</option>
                {kbTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {filteredKb.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>אין עדיין ערכי-ידע רלוונטיים.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredKb.map((item) => (
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
        {status === 'closed' ? (
          <div style={{ background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', borderRadius: 12, padding: '14px 18px', fontWeight: 600, marginTop: 20 }}>
            ✓ הקריאה סגורה.{caseData.closedReason ? ` סיבה: ${caseData.closedReason}` : ''}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--k-border)', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginInlineEnd: 'auto' }}>
                "בטיפול"/"ממתין ללקוח" נבחרים מהתפריט בראש; "סגירה" ו"שינוי נציג מטפל" כאן הן פעולות נפרדות ובולטות.
              </span>
              <button
                type="button" onClick={() => setClosing((v) => !v)}
                style={{ fontFamily: 'var(--k-font-display)', fontSize: 13.5, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', background: 'var(--k-ok-bg)', color: 'var(--k-ok-text)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <CheckIcon size={13} /> סגירת קריאה
              </button>
              <button
                type="button" onClick={() => setTransferring((v) => !v)}
                style={{ fontFamily: 'var(--k-font-display)', fontSize: 13.5, border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', background: 'var(--k-surface)', color: 'var(--k-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <TransferIcon size={13} /> שינוי נציג מטפל
              </button>
            </div>
            {closing && (
              <div style={{ border: '1px dashed var(--k-border)', borderRadius: 10, padding: '10px 14px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--k-surface)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>סיבת-סגירה:</span>
                <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} style={{ fontSize: 12.5, border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 12px', background: 'var(--k-bg)', color: 'var(--k-text)' }}>
                  {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={handleCloseConfirm} disabled={isPending} style={{ fontSize: 12, fontWeight: 600, background: 'var(--k-ok-text)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}>
                  אישור סגירה
                </button>
              </div>
            )}
            {transferring && (
              <div style={{ border: '1px dashed var(--k-border)', borderRadius: 10, padding: '10px 14px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--k-surface)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>נציג-מטפל חדש:</span>
                <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} style={{ fontSize: 12.5, border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 12px', background: 'var(--k-bg)', color: 'var(--k-text)' }}>
                  <option value="">ללא נציג</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button type="button" onClick={handleTransferConfirm} disabled={isPending} style={{ fontSize: 12, fontWeight: 600, background: 'var(--k-text)', color: 'var(--k-bg)', border: 'none', borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}>
                  אישור שינוי
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
