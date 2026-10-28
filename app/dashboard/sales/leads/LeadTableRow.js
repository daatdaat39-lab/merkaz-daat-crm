'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { initials } from '../../components/ui';
import { CLOSE_REASONS } from '../../components/pipelines';
import { assignAgentForLead, updateLeadStage, updateDepartmentExtraField } from '../../contacts/actions';
import ContactQuickActions from '../../components/ContactQuickActions';
import ExtraFieldCell from '../../components/ExtraFieldCell';
import { computeFieldValue } from '../../lib/computedFields';
import { celebrate } from '../../components/celebrate';
import { PhoneIcon, PersonIcon, SparkleIcon, WarningIcon, MailIcon } from '../../components/icons';

function elapsedLabel(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'עודכן לפני פחות משעה';
  if (hours < 24) return `${hours} שעות מאז הטיפול האחרון`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'יום' : 'ימים'} מאז הטיפול האחרון`;
}

const COL_COUNT = 5;

// שורת-ליד בטבלה (כיוון 🅰 מהסקיצה - נבחר במקום הכרטיסים) - אותו עיקרון
// בדיוק כמו LeadCard.js היה (5 שדות חיוניים בלבד + צ'יפ-AI + "עוד
// פרטים"), רק בפריסת-טבלה: שורה ראשית עם העמודות, שורה שנייה
// (colSpan מלא) לצ'יפ-ה-AI ולהרחבה - ציר-זמן/תגיות/שדות-נוספים לא
// נכנסים טבעי לעמודה, צריכים רוחב-מלא.
export default function LeadTableRow({ contact: c, agents, workspaceId, workspaceName, stages = [], sideStages = [], stageLabels = {}, stageColors = {}, leadStages = [], sendConnections = [], whatsappTemplates = [], emailTemplates = [], selected = false, onToggleSelect, extraFields = [], closeReasons }) {
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
      await assignAgentForLead(c.departmentRowId, e.target.value || null);
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

  // שדות-מחלקתיים-מותאמים (extraFields) הם ברובם מידע-אחרי-הרשמה (סטטוס-
  // לימודים/תשלום, סנכרון-אורביט וכו') - חסרי-משמעות לליד שעדיין בשלב
  // מוקדם (לפני שהוא בכלל תלמיד/לקוח). מוצגים רק אחרי שהשלב התקדם מעבר
  // לשלבי-הליד הראשוניים - לא עוד "עוד פרטים" שתמיד מלא ברעש לא-רלוונטי.
  const isEarlyLeadStage = leadStages.includes(c.stage);
  const visibleExtraFields = isEarlyLeadStage ? [] : extraFields;

  const hasExpandableInfo = Boolean(c.email) || c.inquiryCount > 1 || c.existingElsewhere
    || c.createdByManager || (c.tags || []).length > 0 || visibleExtraFields.length > 0;

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--k-border)', background: overdue ? 'var(--k-caution-bg)' : 'transparent' }}>
        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(c.id, c.contactId)} />
        </td>
        <td style={{ padding: '10px 16px', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/dashboard/contacts/${c.contactId}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 24, height: 24, background: 'var(--k-pill-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--k-pill-text)', flexShrink: 0 }}>
                {initials(c.first, c.last)}
              </span>
              <span style={{ fontFamily: 'var(--k-font-display)', fontSize: 16, color: 'var(--k-text)' }}>{c.first} {c.last}</span>
              {c.courseName && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', borderRadius: 100, padding: '1px 8px' }}>
                  {c.courseName}
                </span>
              )}
              {c.existingElsewhere && (
                <span title="איש הקשר הזה כבר מוכר למערכת ממחלקה אחרת" style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 100, padding: '1px 8px' }}>
                  איש קשר קיים
                </span>
              )}
              {c.repConfidence && (
                <span title="סבירות-לסגור (הערכת-נציג)" style={{ fontSize: 13 }}>
                  {c.repConfidence === 'hot' ? '🔥' : c.repConfidence === 'warm' ? '🙂' : '❄️'}
                </span>
              )}
              {c.aiConfidence && (
                <span title="סבירות-לסגור (הערכת-AI)" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 2, color: 'var(--k-text-muted)' }}>
                  <SparkleIcon size={9} style={{ color: 'var(--k-accent)' }} />
                  {c.aiConfidence === 'hot' ? '🔥' : c.aiConfidence === 'warm' ? '🙂' : '❄️'}
                </span>
              )}
            </Link>
            <Link
              href={`/dashboard/sales/leads/${c.departmentRowId}`} title="התקשרות - פותח את מסך-הטיפול (תסריטים + ציר-זמן + המרה)"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--k-font-body)', fontWeight: 700, fontSize: 11.5,
                background: 'var(--k-accent)', color: '#fff', borderRadius: 100, padding: '4px 11px', textDecoration: 'none', flexShrink: 0,
              }}
            >
              <PhoneIcon size={11} /> התקשר
            </Link>
          </div>
          <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 3 }}>
            {c.source || 'מקור לא ידוע'}{c.phone ? ` · ${c.phone}` : ''}{c.latestReason ? ` · ${c.latestReason}` : ''}
            {c.inquiryCount > 1 && <span style={{ color: 'var(--k-danger-text)', fontWeight: 600 }}> · פנה שוב ({c.inquiryCount})</span>}
          </div>
        </td>
        <td style={{ padding: '10px 16px', fontSize: 13, position: 'relative' }}>
          <select
            value={c.stage}
            onChange={handleStageChange}
            disabled={isPending}
            style={{
              border: 'none', borderRadius: 100, padding: '4px 10px', fontFamily: 'var(--k-font-display)', fontSize: 12, cursor: 'pointer',
              background: 'var(--k-pill-bg)', color: (stageColors[c.stage] || stageColors.open || { color: 'var(--k-pill-text)' }).color,
            }}
          >
            {stages.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
            {sideStages.map((s) => <option key={s} value={s}>{stageLabels[s] || s}</option>)}
          </select>
          {closing && <CloseReasonPicker reasons={closeReasons?.length ? closeReasons : CLOSE_REASONS} onConfirm={handleCloseConfirm} onCancel={() => setClosing(false)} />}
        </td>
        <td style={{ padding: '10px 16px', fontSize: 11.5 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: overdue ? 'var(--k-danger-text)' : 'var(--k-text-muted)', fontWeight: overdue ? 600 : 400 }}>
            {overdue && <WarningIcon size={12} />}{elapsedLabel(c.last_activity_at) || '—'}
          </span>
        </td>
        <td style={{ padding: '10px 16px' }}>
          <select value={c.agent_id || ''} onChange={handleAgentChange} disabled={isPending} style={{ border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'var(--k-surface)', color: 'var(--k-text)' }}>
            <option value="">ללא נציג</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </td>
      </tr>
      <tr style={{ borderBottom: '1px solid var(--k-border)' }}>
        <td></td>
        <td colSpan={COL_COUNT - 1} style={{ padding: '0 16px 10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {c.aiActionSummary ? (
              <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderInlineEnd: '3px solid var(--k-accent)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, display: 'flex', gap: 6, color: 'var(--k-text)' }}>
                <SparkleIcon size={13} style={{ color: 'var(--k-accent)' }} /><span>{c.aiActionSummary}</span>
              </div>
            ) : (
              <div style={{ background: 'var(--k-pill-bg)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: 'var(--k-text-muted)', fontStyle: 'italic' }}>
                אין עדיין המלצת AI - לחץ/י "רענון המלצות" למעלה
              </div>
            )}

            {hasExpandableInfo && (
              <button
                type="button" onClick={() => setExpanded((v) => !v)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: 'var(--k-accent)', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                {expanded ? '▾ הסתר פרטים' : '▸ עוד פרטים'}
              </button>
            )}

            {expanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--k-border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.createdByManager && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--k-pill-text)', background: 'var(--k-pill-bg)', borderRadius: 100, padding: '1px 8px' }}>
                      <PersonIcon size={10} /> יזום ע"י מנהל
                    </span>
                  )}
                  {(c.tags || []).map((t) => (
                    <span key={t} style={{ fontSize: 10, color: 'var(--k-text-muted)', background: 'var(--k-pill-bg)', borderRadius: 100, padding: '1px 8px' }}>{t}</span>
                  ))}
                </div>

                {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--k-text)' }}><MailIcon size={12} /> {c.email}</div>}

                {visibleExtraFields.map((f) => (
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
                  contact={{ id: c.contactId, first: c.first, phone: c.phone, email: c.email, frozen: c.frozen, latestReason: c.latestReason }}
                  departments={workspaceId ? [{ workspaceId, workspaceName }] : []}
                  sendConnections={sendConnections}
                  whatsappTemplates={whatsappTemplates}
                  emailTemplates={emailTemplates}
                />
              </div>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

function CloseReasonPicker({ reasons = CLOSE_REASONS, onConfirm, onCancel }) {
  const [reason, setReason] = useState(reasons[0]);
  return (
    <div style={{ marginTop: 6, padding: 8, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 10, width: 200, position: 'absolute', zIndex: 2, boxShadow: 'var(--shadow-md)' }}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', fontSize: 11.5, border: '1px solid var(--k-border)', borderRadius: 100, padding: '4px 8px', marginBottom: 6, background: 'var(--k-bg)', color: 'var(--k-text)' }}>
        {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onConfirm(reason)} style={{ flex: 1, fontSize: 11, fontWeight: 600, background: 'var(--k-danger-bg)', color: 'var(--k-danger-text)', border: 'none', borderRadius: 100, padding: '5px 0', cursor: 'pointer' }}>אישור</button>
        <button onClick={onCancel} style={{ flex: 1, fontSize: 11, background: 'var(--k-bg)', border: '1px solid var(--k-border)', borderRadius: 100, padding: '5px 0', cursor: 'pointer', color: 'var(--k-text)' }}>ביטול</button>
      </div>
    </div>
  );
}
