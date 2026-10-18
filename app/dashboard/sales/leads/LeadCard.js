'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { initials } from '../../components/ui';
import { CLOSE_REASONS } from '../../components/pipelines';
import { assignAgent, updateLeadStage, updateDepartmentExtraField } from '../../contacts/actions';
import ContactQuickActions from '../../components/ContactQuickActions';
import ExtraFieldCell from '../../components/ExtraFieldCell';
import { computeFieldValue } from '../../lib/computedFields';
import { celebrate } from '../../components/celebrate';
import { card } from '../../components/designTokens';

// זהה ל-elapsedLabel ב-LeadRow.js (נשאר שם כברירת-מחדל-לחזרה) - לא
// יצרתי קובץ-שיתוף ייעודי לפונקציה-אחת-שורה שלא צפויה להשתנות בנפרד.
function elapsedLabel(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'עודכן לפני פחות משעה';
  if (hours < 24) return `${hours} שעות מאז הטיפול האחרון`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'יום' : 'ימים'} מאז הטיפול האחרון`;
}

const inputStyle = { border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 };

// כרטיס-ליד (שלב 1 מתוכנית-העיצוב-מחדש) - מציג רק את 5 השדות שסומנו
// כחיוניים (מקור, שם+טלפון, שלב, זמן-מאז-טיפול, נציג) + חריץ-AI
// (placeholder בשלב הזה, יתמלא בשלב 2). שאר השדות (אימייל, תגיות,
// מהות-פנייה מלאה, שדות-נוספים, התראות-מותנות) מאחורי "עוד פרטים" -
// "מה שלא חייב - שלא יהיה", בדיוק כפי שסוכם. תגית-השלב תמיד ברקע-נייטרלי
// (לא צבע-הרקע-המדויק שהמנהל בחר בהגדרות-Pipelines) - שינוי-התנהגות
// מכוון שאושר במפורש, כדי שהצבעוניות תישאר עדינה בלי קשר למה שהוגדר שם.
export default function LeadCard({ contact: c, agents, workspaceId, workspaceName, stages = [], sideStages = [], stageLabels = {}, stageColors = {}, sendConnections = [], whatsappTemplates = [], emailTemplates = [], selected = false, onToggleSelect, extraFields = [], closeReasons }) {
  const [isPending, startTransition] = useTransition();
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [extraValues, setExtraValues] = useState(c.extra_fields || {});
  const router = useRouter();

  function handleExtraFieldChange(key, value) {
    setExtraValues((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      await updateDepartmentExtraField(c.departmentRowId, key, value);
      router.refresh();
    });
  }

  const hours = c.last_activity_at ? (Date.now() - new Date(c.last_activity_at).getTime()) / 3600000 : 0;
  const overdue = hours >= 24;

  function handleAgentChange(e) {
    startTransition(async () => {
      await assignAgent(c.id, workspaceId, e.target.value || null);
      router.refresh();
    });
  }

  function handleStageChange(e) {
    const value = e.target.value;
    if (value === 'closed') { setClosing(true); return; }
    const movingForward = stages.indexOf(value) > stages.indexOf(c.stage);
    startTransition(async () => {
      await updateLeadStage(c.departmentRowId, value, null);
      if (movingForward) celebrate();
      router.refresh();
    });
  }

  function handleCloseConfirm(reason) {
    setClosing(false);
    startTransition(async () => {
      await updateLeadStage(c.departmentRowId, 'closed', reason);
      router.refresh();
    });
  }

  const hasExpandableInfo = Boolean(c.email) || c.inquiryCount > 1 || c.latestReason || c.existingElsewhere
    || c.createdByManager || (c.tags || []).length > 0 || extraFields.length > 0;

  return (
    <div style={{ ...card({ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }), borderInlineStart: overdue ? '3px solid var(--danger, #a3392f)' : card().border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(c.id)} style={{ flexShrink: 0 }} />
          <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', fontWeight: 600, fontSize: 13.5, minWidth: 0 }}>
            <span style={{ width: 26, height: 26, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
              {initials(c.first, c.last)}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first} {c.last}</span>
          </Link>
          <Link href={`/dashboard/sales/leads/${c.departmentRowId}`} title="פתיחת מסך-טיפול (תסריטים + ציר-זמן + המרה)" style={{ fontSize: 13, textDecoration: 'none', flexShrink: 0, opacity: 0.7 }}>
            📋
          </Link>
        </div>
        <div style={{ flexShrink: 0 }}>
          <select
            value={c.stage}
            onChange={handleStageChange}
            disabled={isPending}
            style={{
              border: 'none', borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'var(--bg-tertiary)', color: (stageColors[c.stage] || stageColors.open || { color: 'var(--text-secondary)' }).color,
            }}
          >
            {stages.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
            {sideStages.map((s) => <option key={s} value={s}>{stageLabels[s] || s}</option>)}
          </select>
          {closing && <CloseReasonPicker reasons={closeReasons?.length ? closeReasons : CLOSE_REASONS} onConfirm={handleCloseConfirm} onCancel={() => setClosing(false)} />}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span>{c.source || 'מקור לא ידוע'}</span>
        {c.phone && <><span style={{ opacity: 0.4 }}>·</span><span dir="ltr">{c.phone}</span></>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
        <span style={{ color: overdue ? 'var(--danger, #a3392f)' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
          {overdue && '⚠ '}{elapsedLabel(c.last_activity_at) || '—'}
        </span>
        <select
          value={c.agent_id || ''}
          onChange={handleAgentChange}
          disabled={isPending}
          style={{ ...inputStyle, maxWidth: 130 }}
        >
          <option value="">ללא נציג</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {c.aiActionSummary ? (
        <div style={{ background: 'var(--purple-bg, #f5f3ff)', border: '1px solid var(--purple, #7c3aed)', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, display: 'flex', gap: 6 }}>
          <span>💡</span><span>{c.aiActionSummary}</span>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '7px 10px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          אין עדיין המלצת AI - לחץ/י "רענון המלצות" למעלה
        </div>
      )}

      {hasExpandableInfo && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: 'var(--accent, #2f6f4f)', cursor: 'pointer', textAlign: 'start', alignSelf: 'flex-start' }}
        >
          {expanded ? '▾ הסתר פרטים' : '▸ עוד פרטים'}
        </button>
      )}

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--bg-tertiary)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {c.existingElsewhere && (
              <span title="איש הקשר הזה כבר מוכר למערכת ממחלקה אחרת" style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 100, padding: '1px 8px' }}>
                איש קשר קיים
              </span>
            )}
            {c.createdByManager && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#6d28d9', background: '#f5f3ff', borderRadius: 100, padding: '1px 8px' }}>
                👤 יזום ע"י מנהל
              </span>
            )}
            {c.inquiryCount > 1 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--danger, #a3392f)', background: 'var(--danger-soft, #fdecea)', borderRadius: 100, padding: '1px 8px' }}>
                🔄 פנה שוב ({c.inquiryCount})
              </span>
            )}
            {(c.tags || []).map((t) => (
              <span key={t} style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 100, padding: '1px 8px' }}>{t}</span>
            ))}
          </div>

          {c.email && <div style={{ fontSize: 12 }}>✉️ {c.email}</div>}
          {c.latestReason && <div style={{ fontSize: 12 }}>מהות הפנייה: {c.latestReason}</div>}

          {extraFields.map((f) => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{f.label}:</span>
              {f.type === 'computed' ? (
                <span style={{ color: 'var(--text-muted)' }}>{computeFieldValue(f, extraValues, extraFields) || '—'}</span>
              ) : (
                <ExtraFieldCell field={f} value={extraValues[f.key]} onCommit={(value) => handleExtraFieldChange(f.key, value)} disabled={isPending} />
              )}
            </div>
          ))}

          <ContactQuickActions
            contact={{ id: c.id, first: c.first, phone: c.phone, email: c.email, frozen: c.frozen, latestReason: c.latestReason }}
            departments={workspaceId ? [{ workspaceId, workspaceName }] : []}
            sendConnections={sendConnections}
            whatsappTemplates={whatsappTemplates}
            emailTemplates={emailTemplates}
          />
        </div>
      )}
    </div>
  );
}

function CloseReasonPicker({ reasons = CLOSE_REASONS, onConfirm, onCancel }) {
  const [reason, setReason] = useState(reasons[0]);
  return (
    <div style={{ marginTop: 6, padding: 8, background: '#fef2f2', border: '1px solid #f0d0cc', borderRadius: 6, width: 200, position: 'absolute', zIndex: 2 }}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 4, marginBottom: 6 }}>
        {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onConfirm(reason)} style={{ flex: 1, fontSize: 11, background: '#a3392f', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 0', cursor: 'pointer' }}>אישור</button>
        <button onClick={onCancel} style={{ flex: 1, fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 0', cursor: 'pointer' }}>ביטול</button>
      </div>
    </div>
  );
}
