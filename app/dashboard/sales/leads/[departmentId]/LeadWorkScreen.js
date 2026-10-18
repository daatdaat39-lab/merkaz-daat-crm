'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThreeColumnScreen from '../../../components/ThreeColumnScreen';
import UnifiedTimeline from '../../../components/UnifiedTimeline';
import WhatsAppSendModal from '../../../contacts/[id]/WhatsAppSendModal';
import { updateDepartmentExtraField } from '../../../contacts/actions';
import { lockLead, heartbeatLeadLock, releaseLeadLock, convertLead } from './leadLockActions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' };
const btnStyle = { ...inputStyle, width: 'auto', cursor: 'pointer' };
const primaryBtn = { ...btnStyle, background: 'var(--accent, #2f6f4f)', color: '#fff', fontWeight: 600, border: 'none' };
const cardStyle = { background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 };
const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em' };

function telHref(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

// מסך-עבודה לטיפול-בליד (שלב 3) - נועל (migration 0148/lockLead) ברגע
// הפתיחה, פעימת-חיים כל 5 דקות, ומשחרר **רק** ב-beforeunload (לא
// visibilitychange - ר' ההערה המתועדת ב-ActiveCallPanel.js על אותה
// סכנה בדיוק: הסתרת-טאב כשהנציג עובר לחייג מהנייד האישי שלו).
export default function LeadWorkScreen({
  departmentId, aiActionText, contact, department, stageLabel, wonStageLabel, workspaceId, workspaceName,
  courses, playbookItems, whatsappTemplates, timelineProps,
}) {
  const [lockState, setLockState] = useState('checking'); // checking | locked | denied
  const [courseId, setCourseId] = useState(department.extraFields?.course_id || '');
  const [price, setPrice] = useState('');
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
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

  const selectedCourse = courses.find((c) => c.id === courseId);
  const filteredPlaybook = playbookItems.filter((item) => !item.course_id || item.course_id === courseId);

  if (lockState === 'checking') {
    return <div style={{ padding: 24, fontSize: 13 }}>טוען...</div>;
  }

  if (lockState === 'denied') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, marginBottom: 12 }}>⚠ {error}</div>
        <Link href="/dashboard/sales/leads" style={{ fontSize: 13, color: 'var(--accent, #2f6f4f)' }}>← חזרה לרשימת הלידים</Link>
      </div>
    );
  }

  return (
    <ThreeColumnScreen
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{contact.first} {contact.last}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{workspaceName} · {stageLabel}</div>
          </div>
          <Link href={`/dashboard/contacts/${contact.id}`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>פתח כרטיס מלא ←</Link>
        </div>
      }
      right={
        <>
          {aiActionText && (
            <div style={{ background: 'var(--purple-bg, #f5f3ff)', border: '1px solid var(--purple, #7c3aed)', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14, display: 'flex', gap: 7 }}>
              <span>💡</span><span>{aiActionText}</span>
            </div>
          )}

          <div style={sectionLabel}>פרטי יצירת קשר</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 16px' }}>
            {telHref(contact.phone) && <a href={telHref(contact.phone)} style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none' }}>📞 {contact.phone}</a>}
            {telHref(contact.phone2) && <a href={telHref(contact.phone2)} style={{ ...btnStyle, textAlign: 'center', textDecoration: 'none' }}>📞 {contact.phone2} (משני)</a>}
            <button type="button" onClick={() => setShowWhatsApp(true)} style={btnStyle}>💬 וואטסאפ</button>
            {contact.email && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>✉️ {contact.email}</div>}
          </div>

          <div style={cardStyle}>
            <div style={sectionLabel}>קורס</div>
            <select value={courseId} onChange={handleCourseChange} disabled={isPending} style={inputStyle}>
              <option value="">— בחירת קורס —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.price ? ` (₪${c.price})` : ''}</option>)}
            </select>
          </div>

          {converted ? (
            <div style={{ ...cardStyle, background: '#fdf1e2', border: '1px solid #f0c987', color: '#a85c00', fontWeight: 600 }}>
              🎉 ההרשמה נרשמה! השלב עודכן ל-{wonStageLabel || 'ניצחון'}.
            </div>
          ) : (
            <div style={cardStyle}>
              <div style={sectionLabel}>המרה להרשמה</div>
              <div>
                <label style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>מחיר (אופציונלי)</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} placeholder={selectedCourse?.price ? `${selectedCourse.price}` : '₪'} />
              </div>
              <button type="button" onClick={handleConvert} disabled={!courseId || converting} style={{ ...primaryBtn, fontSize: 14, padding: '10px 18px', borderRadius: 10 }}>
                {converting ? 'מבצע...' : `✓ המרה${wonStageLabel ? ` ל-${wonStageLabel}` : ''}`}
              </button>
              {!courseId && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>יש לבחור קורס קודם</div>}
            </div>
          )}

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
          <div style={{ ...sectionLabel, marginBottom: 10 }}>תסריטי מכירה</div>
          {filteredPlaybook.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {courseId ? 'אין עדיין תסריטים לקורס הזה.' : 'בחר/י קורס כדי לראות תסריטים מותאמים.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredPlaybook.map((item) => (
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
          templates={whatsappTemplates} onClose={() => setShowWhatsApp(false)}
          skipRefresh
        />
      )}
    </ThreeColumnScreen>
  );
}
