'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThreeColumnScreen from '../../../components/ThreeColumnScreen';
import UnifiedTimeline from '../../../components/UnifiedTimeline';
import WhatsAppSendModal from '../../../contacts/[id]/WhatsAppSendModal';
import { updateCaseStatus, updateCaseSeverity, assignCaseAgent } from '../actions';
import { lockCase, heartbeatCaseLock, releaseCaseLock } from './caseLockActions';
import { SEVERITY_LABELS, STATUS_LABELS, slaStatus } from '../../../lib/serviceSla';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const btnStyle = { ...inputStyle, width: 'auto', cursor: 'pointer' };
const cardStyle = { background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em' };

function telHref(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

// מסך-עבודה לקריאת-שירות (שלב 4) - נעילה נפרדת-מהליד (migration 0151,
// לא lock_lead) ישירות על service_cases.id. אותה משמעת בדיוק כמו
// LeadWorkScreen.js: heartbeat כל 5 דק', שחרור רק ב-beforeunload.
export default function CaseWorkScreen({
  caseId, caseData, contact, workspaceName, agents, kbItems, whatsappTemplates, workspaceId, timelineProps,
}) {
  const [lockState, setLockState] = useState('checking');
  const [status, setStatus] = useState(caseData.status);
  const [severity, setSeverity] = useState(caseData.severity);
  const [assignedTo, setAssignedTo] = useState(caseData.assignedTo || '');
  const [tagFilter, setTagFilter] = useState('');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
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
        <Link href="/dashboard/service/cases" style={{ fontSize: 13, color: 'var(--accent, #2f6f4f)' }}>← חזרה לרשימת הקריאות</Link>
      </div>
    );
  }

  return (
    <ThreeColumnScreen
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>#{caseData.caseNumber} · {caseData.subject}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{contact.first} {contact.last} · {workspaceName}</div>
          </div>
          <Link href={`/dashboard/contacts/${contact.id}`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>פתח כרטיס מלא ←</Link>
        </div>
      }
      right={
        <>
          {sla && (
            <div style={{ ...cardStyle, background: sla.bg, border: `1px solid ${sla.color}33` }}>
              <div style={sectionLabel}>SLA</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: sla.color }}>{sla.label}</div>
            </div>
          )}

          <div style={sectionLabel}>פרטי יצירת קשר</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 16px' }}>
            {telHref(contact.phone) && <a href={telHref(contact.phone)} style={{ ...btnStyle, textAlign: 'center', textDecoration: 'none', background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, border: 'none' }}>📞 {contact.phone}</a>}
            <button type="button" onClick={() => setShowWhatsApp(true)} style={btnStyle}>💬 תגובה מהירה (וואטסאפ)</button>
            {contact.email && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>✉️ {contact.email}</div>}
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

          {error && <div style={{ fontSize: 12, color: '#c62828' }}>{error}</div>}
        </>
      }
      center={
        <>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>ציר זמן</div>
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
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>אין עדיין ערכי-ידע רלוונטיים.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredKb.map((item) => (
                <details key={item.id} style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 12px' }}>
                  <summary style={{ fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    {item.title}{item.tag ? ` · ${item.tag}` : ''}
                  </summary>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{item.body}</div>
                </details>
              ))}
            </div>
          )}
        </>
      }
    >
      {showWhatsApp && (
        <WhatsAppSendModal
          contactId={contact.id} workspaceId={workspaceId} phone={contact.phone}
          templates={relevantTemplates} onClose={() => setShowWhatsApp(false)}
          skipRefresh
        />
      )}
    </ThreeColumnScreen>
  );
}
