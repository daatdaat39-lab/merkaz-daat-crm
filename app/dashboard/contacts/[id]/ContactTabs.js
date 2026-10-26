'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NotConnectedButton from '../../components/NotConnectedButton';
import { celebrate } from '../../components/celebrate';
import { addTask } from '../../tasks/actions';
import { updateDepartmentExtraField } from '../actions';
import { isProcessConcluded } from '../../lib/pipelineVisibility';
import { computeFieldValue } from '../../lib/computedFields';
import KesherProjectPanel from './KesherProjectPanel';
import CourseEnrollmentsPanel from './CourseEnrollmentsPanel';
import CoursePurchasesPanel from './CoursePurchasesPanel';
import SeminarParticipationsPanel from './SeminarParticipationsPanel';
import StageStepper from './StageStepper';
import Link from 'next/link';
import { STATUS_LABELS, SEVERITY_LABELS, slaStatus } from '../../lib/serviceSla';

export default function ContactTabs({ meetings, tasks, notes, contactId, toggleTaskAction, updateNotesAction, frozen, inquiries = [], sentEmails = [], sentWhatsapp = [], donationTransactions = [], commitments = [], additionalPhones = [], courseEnrollments = [], coursePurchases = [], serviceCases = [], seminarParticipations = [], callHistory = [], agents = [], workspaceNameById = {}, phoneCalls = [], activeDepartment = null, pipeline = null, mainProcessConcluded = false, onReopenMain, onReopenCampaign, onCampaignStageChange, isManager = false, relatedContact = null }) {
  const [tab, setTab] = useState('activity');
  const [currentFilter, setCurrentFilter] = useState('all'); // all | processes | cases | tasks | payments
  const [notesValue, setNotesValue] = useState(notes || '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [addingTask, setAddingTask] = useState(false);
  const [extraValues, setExtraValues] = useState(activeDepartment?.extraFields || {});
  const router = useRouter();

  useEffect(() => {
    setExtraValues(activeDepartment?.extraFields || {});
  }, [activeDepartment?.id]);

  function handleExtraFieldChange(key, value) {
    if (!activeDepartment) return;
    setExtraValues((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      await updateDepartmentExtraField(activeDepartment.id, key, value);
      router.refresh();
    });
  }

  function handleAddTask(formData) {
    setError(null);
    formData.set('contact_id', contactId);
    startTransition(async () => {
      const res = await addTask(formData);
      if (res?.error) setError(res.error);
      else { setAddingTask(false); router.refresh(); }
    });
  }

  function handleToggleTask(taskId, done) {
    setError(null);
    const fd = new FormData();
    fd.set('task_id', taskId);
    fd.set('done', done.toString());
    startTransition(async () => {
      const res = await toggleTaskAction(fd);
      if (res?.error) setError(res.error);
      else {
        if (done) celebrate();
        router.refresh();
      }
    });
  }

  function handleSaveNotes(formData) {
    setError(null);
    startTransition(async () => {
      const res = await updateNotesAction(contactId, formData.get('notes'));
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const fieldDefs = activeDepartment?.fieldDefs || [];
  // שליטת מנהל (visible_to_agents) - שדה חסום נעלם גם מטאב "שדות נוספים"
  // עצמו, לא רק מהקוביה, לכל מי שאינו owner/admin.
  const visibleFieldDefs = fieldDefs.filter((f) => f.visibleToAgents !== false || isManager);
  const deptTransactions = activeDepartment ? donationTransactions.filter((t) => t.workspace_id === activeDepartment.workspaceId) : [];
  const deptCommitments = activeDepartment ? commitments.filter((c) => c.workspace_id === activeDepartment.workspaceId) : [];
  const deptCourseEnrollments = activeDepartment ? courseEnrollments.filter((e) => e.workspace_id === activeDepartment.workspaceId) : [];
  const deptCoursePurchases = activeDepartment ? coursePurchases.filter((p) => p.workspace_id === activeDepartment.workspaceId) : [];
  const deptSeminarParticipations = activeDepartment ? seminarParticipations.filter((p) => p.workspace_id === activeDepartment.workspaceId) : [];
  const deptServiceCases = activeDepartment ? serviceCases.filter((c) => c.workspace_id === activeDepartment.workspaceId) : [];
  const openServiceCasesCount = deptServiceCases.filter((c) => c.status !== 'closed').length;
  const deptActiveCommitments = deptCommitments.filter((c) => c.status === 'active');
  const mainProcessOpen = activeDepartment && !mainProcessConcluded && activeDepartment.openedProcess !== false;
  const openCampaignProcessesCount = (activeDepartment?.campaignProcesses || []).filter((cp) => !isProcessConcluded(cp.status, cp.stages)).length;
  const processesCount = (mainProcessOpen ? 1 : 0) + openCampaignProcessesCount;
  // "פעילות נוכחית" מאחד-מה-שהיה-פעם 3 טאבים-נפרדים (תהליכים/קריאות-
  // שירות/משימות) + סיכום-התחייבות-פעילה (שהיה-חלק-מ-KesherProjectPanel
  // ב"שדות נוספים") - צ'יפ-סינון-פנימי במקום-ניווט-שטוח. "היסטוריה"
  // (היה "פעילות") סופגת גם את "הקלטות שיחה" - זו הייתה ממילא-רק-תת-
  // קבוצה-כפולה של קבוצת "שיחות טלפון" בתוכה (אותו player, אותם נתונים).
  const currentCount = processesCount + openServiceCasesCount + tasks.filter((t) => !t.done).length;
  const tabs = [
    { id: 'current', label: `פעילות נוכחית${currentCount ? ` (${currentCount})` : ''}` },
    { id: 'activity', label: 'היסטוריה' },
    { id: 'notes', label: 'הערות' },
    { id: 'documents', label: 'מסמכים' },
    // הטאב מוצג אם יש בו משהו להראות - לא רק שדות נוספים מוגדרים
    // (workspace_extra_fields), אלא גם פאנלים ייעודיים (KesherProjectPanel/
    // CourseEnrollmentsPanel/SeminarParticipationsPanel) שיכולים להכיל מידע
    // אמיתי גם במחלקה בלי שום שדה נוסף מוגדר (כמו "סמינרים" - אין לה
    // extra fields בכלל, כל המידע שלה ב-contact_seminar_participations).
    ...(activeDepartment && (
      visibleFieldDefs.length > 0 || deptCourseEnrollments.length > 0 || deptCoursePurchases.length > 0 || deptSeminarParticipations.length > 0 ||
      deptCommitments.length > 0 || deptTransactions.length > 0 ||
      (activeDepartment.workspaceName === 'תרומות' && relatedContact?.donationsCount > 0)
    ) ? [{ id: 'fields', label: `שדות נוספים — ${activeDepartment.workspaceName}` }] : []),
    ...(additionalPhones.length > 0 ? [{ id: 'phones', label: `טלפונים נוספים (${additionalPhones.length})` }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--k-border)', gap: 18, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: 'var(--k-font-display)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
              fontSize: 13.5, color: tab === t.id ? 'var(--k-accent)' : 'var(--k-text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--k-accent)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'current' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { v: 'all', l: 'הכל' },
              ...(activeDepartment ? [{ v: 'processes', l: `תהליכים${processesCount ? ` (${processesCount})` : ''}` }] : []),
              ...(deptServiceCases.length > 0 ? [{ v: 'cases', l: `קריאות שירות${openServiceCasesCount ? ` (${openServiceCasesCount})` : ''}` }] : []),
              { v: 'tasks', l: `משימות${tasks.length ? ` (${tasks.length})` : ''}` },
              ...(deptActiveCommitments.length > 0 ? [{ v: 'payments', l: 'תשלומים' }] : []),
            ].map((f) => (
              <button
                key={f.v} type="button" onClick={() => setCurrentFilter(f.v)}
                style={{
                  fontSize: 12.5, padding: '5px 14px', borderRadius: 100, cursor: 'pointer',
                  border: currentFilter === f.v ? '1px solid var(--k-accent)' : '1px solid var(--k-border)',
                  background: currentFilter === f.v ? 'var(--k-pill-bg)' : 'var(--k-surface)',
                  color: currentFilter === f.v ? 'var(--k-accent)' : 'var(--k-text-muted)',
                }}
              >
                {f.l}
              </button>
            ))}
          </div>

          {(currentFilter === 'all' || currentFilter === 'processes') && activeDepartment && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeDepartment.openedProcess !== false && (
                <ProcessCard
                  title={`תהליך ראשי — ${activeDepartment.workspaceName}`}
                  label={pipeline?.labels?.[activeDepartment.stage] || activeDepartment.stage}
                  concluded={mainProcessConcluded}
                  onReopen={onReopenMain}
                />
              )}
              {(activeDepartment.campaignProcesses || []).map((cp) => (
                <CampaignProcessCard
                  key={cp.rowId}
                  cp={cp}
                  concluded={isProcessConcluded(cp.status, cp.stages)}
                  onReopen={() => onReopenCampaign(cp.rowId, cp.stages)}
                  onStageChange={onCampaignStageChange}
                  disabled={frozen}
                />
              ))}
            </div>
          )}

          {(currentFilter === 'all' || currentFilter === 'cases') && deptServiceCases.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deptServiceCases.map((c) => {
                const sla = c.status === 'closed' ? null : slaStatus(c.sla_due_at, c.severity);
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/service/cases/${c.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      border: '1px solid var(--k-border)', borderRadius: 8, padding: '10px 14px', textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--k-text)' }}>#{c.case_number} — {c.subject}</div>
                      <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 2 }}>
                        {STATUS_LABELS[c.status] || c.status} · חומרה {SEVERITY_LABELS[c.severity] || c.severity}
                      </div>
                    </div>
                    {sla && (
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: sla.bg, color: sla.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {sla.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {(currentFilter === 'all' || currentFilter === 'tasks') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {error && <div style={{ color: 'var(--k-danger-text)', fontSize: 12 }}>שגיאה: {error}</div>}

              {!frozen && (addingTask ? (
                <form action={handleAddTask} style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', border: '1px solid var(--k-border)',
                  borderRadius: 12, padding: '10px 12px', background: 'var(--k-pill-bg)',
                }}>
                  <input
                    name="title" placeholder="כותרת המשימה..." autoFocus required
                    style={{ flex: '1 1 160px', border: '1px solid var(--k-border)', borderRadius: 100, padding: '6px 10px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' }}
                  />
                  <input name="due_date" type="date" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '6px 10px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' }} />
                  <input name="due_time" type="time" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '6px 10px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' }} />
                  {agents.length > 0 && (
                    <select name="assigned_to" style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '6px 10px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' }}>
                      <option value="">אני</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                  <button type="submit" disabled={isPending} style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
                    הוספה
                  </button>
                  <button type="button" onClick={() => setAddingTask(false)} style={{ background: 'none', border: '1px solid var(--k-border)', borderRadius: 100, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', color: 'var(--k-text)' }}>
                    ביטול
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setAddingTask(true)}
                  style={{ alignSelf: 'flex-start', background: 'var(--k-surface)', border: '1px dashed var(--k-border)', borderRadius: 100, padding: '6px 14px', fontSize: 12.5, color: 'var(--k-text-muted)', cursor: 'pointer' }}
                >
                  + משימה חדשה
                </button>
              ))}

              {tasks.length === 0 && <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>אין משימות</div>}
              {tasks.map((t) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--k-border)',
                  borderRadius: 8, padding: '9px 14px',
                }}>
                  <button
                    onClick={() => handleToggleTask(t.id, !t.done)}
                    disabled={isPending || frozen}
                    style={{
                      width: 18, height: 18, borderRadius: 5, border: '1px solid var(--k-border)',
                      background: t.done ? 'var(--k-ok-text)' : 'var(--k-surface)', color: '#fff', fontSize: 11,
                      cursor: frozen ? 'default' : 'pointer', flexShrink: 0, opacity: frozen ? 0.5 : 1,
                    }}
                  >
                    {t.done ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--k-text-muted)' : 'var(--k-text)' }}>
                      <DeptTag name={workspaceNameById[t.workspace_id]} />
                      {t.title}
                    </div>
                    {t.due_date && (
                      <div style={{ fontSize: 11, color: 'var(--k-text-muted)' }}>יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(currentFilter === 'all' || currentFilter === 'payments') && deptActiveCommitments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deptActiveCommitments.map((c) => (
                <div key={c.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--k-ok-text)' }}>
                    הוראת-קבע פעילה — ₪{Number(c.total_amount).toLocaleString('he-IL')}
                    {c.frequency ? ` · ${c.frequency}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 2 }}>
                    {c.installments_count ? `${c.installments_count} תשלומים · ` : ''}
                    {c.start_date ? `מתחילה ${new Date(c.start_date).toLocaleDateString('he-IL')}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentFilter === 'all' && processesCount === 0 && openServiceCasesCount === 0 && tasks.length === 0 && deptActiveCommitments.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>אין כרגע תהליכים, קריאות-שירות, משימות או תשלומים פתוחים.</div>
          )}
        </div>
      )}

      {tab === 'activity' && (() => {
        const groups = [
          {
            key: 'inquiries', title: 'היסטוריית פניות — כל המחלקות', shortLabel: 'פניות', items: inquiries,
            renderItem: (inq, i) => (
              <div key={i} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={inq.workspaceName} />
                <span style={{ color: 'var(--k-text)' }}>{inq.reason}</span>
                {inq.note && <span style={{ color: 'var(--k-text-muted)' }}> — {inq.note}</span>}
                <span style={{ color: 'var(--k-text-muted)' }}> · {new Date(inq.created_at).toLocaleDateString('he-IL')}</span>
              </div>
            ),
          },
          {
            key: 'emails', title: 'מיילים שנשלחו — כל המחלקות', shortLabel: 'מיילים', items: sentEmails,
            renderItem: (e) => (
              <div key={e.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={workspaceNameById[e.workspace_id]} />
                <div style={{ fontWeight: 500 }}>{e.subject}</div>
                <div style={{ color: 'var(--k-text-muted)', marginTop: 2 }}>
                  מאת {e.from_address} · {new Date(e.sent_at).toLocaleDateString('he-IL')} {new Date(e.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ),
          },
          {
            key: 'whatsapp', title: 'הודעות WhatsApp — כל המחלקות', shortLabel: 'הודעות WhatsApp', items: sentWhatsapp,
            renderItem: (w) => (
              <div key={w.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={workspaceNameById[w.workspace_id]} />
                <div style={{ fontWeight: 500 }}>
                  {w.direction === 'in' ? '⬅️ מהלקוח: ' : '➡️ נשלח: '}
                  {w.kind === 'chat' ? w.message : `הודעת תבנית${w.reason ? ` — ${w.reason}` : ''}`}
                </div>
                <div style={{ color: 'var(--k-text-muted)', marginTop: 2 }}>
                  {w.phone} · {new Date(w.sent_at).toLocaleDateString('he-IL')} {new Date(w.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ),
          },
          {
            key: 'donations', title: 'תשלומים ותרומות', shortLabel: 'תשלומים', items: donationTransactions,
            renderItem: (t) => (
              <div key={t.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={workspaceNameById[t.workspace_id]} />
                <span style={{ fontWeight: 600, color: 'var(--k-ok-text)' }}>₪{Number(t.amount).toLocaleString('he-IL')}</span>
                <span style={{ color: 'var(--k-text-muted)' }}> · {new Date(t.transaction_date).toLocaleDateString('he-IL')}</span>
                {t.source_system && <span style={{ color: 'var(--k-text-muted)' }}> · {t.source_system}</span>}
                {t.receipt_url && (
                  <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 8, color: 'var(--k-accent)' }}>
                    📄 קבלה
                  </a>
                )}
              </div>
            ),
          },
          {
            key: 'call_history', title: 'היסטוריית שיחות (מיובאת)', shortLabel: 'היסטוריית שיחות', items: callHistory,
            renderItem: (c) => (
              <div key={c.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>📞 {c.response_text || 'שיחה'}</span>
                {c.call_date && <span style={{ color: 'var(--k-text-muted)' }}> · {new Date(c.call_date).toLocaleDateString('he-IL')}</span>}
                {c.source_system && <span style={{ color: 'var(--k-text-muted)' }}> · {c.source_system}</span>}
              </div>
            ),
          },
          {
            key: 'phone_calls', title: 'שיחות טלפון (015)', shortLabel: 'שיחות טלפון', items: phoneCalls,
            renderItem: (c) => (
              <div key={c.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>{c.direction === 'outbound' ? '📤 יוצאת' : '📥 נכנסת'}</span>
                <span> · {c.answered ? 'נענתה' : 'לא נענתה'}</span>
                {c.duration_seconds ? <span style={{ color: 'var(--k-text-muted)' }}> · {Math.round(c.duration_seconds / 60)} דק'</span> : null}
                {c.started_at && <span style={{ color: 'var(--k-text-muted)' }}> · {new Date(c.started_at).toLocaleDateString('he-IL')} {new Date(c.started_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
                {c.recording_url && (
                  <div style={{ marginTop: 6 }}>
                    <audio controls src={c.recording_url} style={{ height: 32, maxWidth: '100%' }} />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'meetings', title: 'פגישות — כל המחלקות', shortLabel: 'פגישות', items: meetings,
            renderItem: (m) => (
              <div key={m.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '10px 14px' }}>
                <DeptTag name={workspaceNameById[m.workspace_id]} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title || 'פגישה'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', marginTop: 3 }}>
                  {new Date(m.meeting_date).toLocaleDateString('he-IL')} · {m.meeting_time?.slice(0, 5)} · {m.type}
                  {m.location ? ` · ${m.location}` : ''}
                </div>
                {m.type === 'זום' && m.zoom_join_url && (
                  <a href={m.zoom_join_url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 11.5, color: 'var(--k-accent)', marginTop: 4 }}>🔗 קישור Zoom</a>
                )}
                {m.notes && <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--k-text)' }}>{m.notes}</div>}
              </div>
            ),
          },
        ];
        const withContent = groups.filter((g) => g.items.length > 0);
        const empty = groups.filter((g) => g.items.length === 0);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {withContent.map((g) => (
              <ActivityGroup key={g.key} title={g.title} items={g.items} renderItem={g.renderItem} />
            ))}
            {empty.length > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)' }}>
                כאן תראה: {empty.map((g) => g.shortLabel).join(' · ')}
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'notes' && (
        <form action={handleSaveNotes} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ color: 'var(--k-danger-text)', fontSize: 12 }}>שגיאה: {error}</div>}
          <textarea
            name="notes"
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={8}
            disabled={frozen}
            style={{
              width: '100%', border: '1px solid var(--k-border)', borderRadius: 8, padding: 12,
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            }}
            placeholder="הערות פנימיות על איש הקשר..."
          />
          <button type="submit" disabled={isPending || frozen} style={{
            alignSelf: 'flex-start', background: 'var(--k-accent)', color: '#fff', border: 'none',
            borderRadius: 100, padding: '7px 16px', fontSize: 13, cursor: frozen ? 'default' : 'pointer', opacity: frozen ? 0.5 : 1,
          }}>
            שמירת הערות
          </button>
        </form>
      )}

      {tab === 'fields' && activeDepartment && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          {activeDepartment.workspaceName === 'תרומות' && relatedContact?.donationsCount > 0 && (
            <div style={{
              background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', borderRadius: 10,
              padding: '8px 10px', fontSize: 12.5, color: 'var(--k-accent)',
            }}>
              🔗 יש {relatedContact.donationsCount} תרומות בסך ₪{relatedContact.donationsTotal.toLocaleString('he-IL')} אצל {relatedContact.first} {relatedContact.last} - לא נספר בכספי הכרטיס הזה.
            </div>
          )}
          <KesherProjectPanel
            workspaceName={activeDepartment.workspaceName}
            commitments={deptCommitments}
            oneTimeTransactions={deptTransactions.filter((t) => !t.commitment_id)}
            linkedTransactions={deptTransactions.filter((t) => !!t.commitment_id)}
            extraValues={extraValues}
          />
          <CourseEnrollmentsPanel enrollments={deptCourseEnrollments} />
          <CoursePurchasesPanel purchases={deptCoursePurchases} />
          <SeminarParticipationsPanel participations={deptSeminarParticipations} />
          {visibleFieldDefs.map((f) => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 11.5, color: 'var(--k-text-muted)', marginBottom: 4 }}>{f.label}</label>
              {f.type === 'computed' ? (
                <div style={{ fontSize: 13, color: 'var(--k-text-muted)', padding: '7px 0' }}>{computeFieldValue(f, extraValues, fieldDefs, deptTransactions) || '—'}</div>
              ) : f.type === 'select' && f.allowMultiple ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '4px 0' }}>
                  {(f.options || []).map((o) => {
                    const selected = Array.isArray(extraValues[f.key]) ? extraValues[f.key] : [];
                    const checked = selected.includes(o);
                    return (
                      <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, cursor: frozen ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={frozen}
                          onChange={() => handleExtraFieldChange(f.key, checked ? selected.filter((v) => v !== o) : [...selected, o])}
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              ) : f.type === 'select' ? (
                <select
                  value={extraValues[f.key] || ''}
                  onChange={(e) => handleExtraFieldChange(f.key, e.target.value)}
                  disabled={frozen}
                  style={{ width: '100%', border: '1px solid var(--k-border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
                >
                  <option value="">—</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={extraValues[f.key] || ''}
                  onChange={(e) => setExtraValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  onBlur={(e) => handleExtraFieldChange(f.key, e.target.value)}
                  disabled={frozen}
                  style={{ width: '100%', border: '1px solid var(--k-border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'phones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {additionalPhones.map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '9px 14px', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{p.phone}</span>
              {p.label && <span style={{ color: 'var(--k-text-muted)' }}> · {p.label}</span>}
              {p.source && <span style={{ color: 'var(--k-text-muted)' }}> · {p.source}</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--k-text-muted)', marginBottom: 10 }}>אין מסמכים</div>
          <NotConnectedButton
            label="העלאת מסמך"
            icon="📎"
            message="העלאת תעודת בגרות / גיליון ציונים — עדיין לא מחובר"
          />
        </div>
      )}

      {/* "הקלטות שיחה" הוסר כטאב-נפרד - היה בדיוק תת-קבוצה-כפולה של
          קבוצת "שיחות טלפון" בטאב "היסטוריה" (אותו player, אותם נתונים,
          ר' phoneCalls group למעלה ב-tab==='activity'). */}
    </div>
  );
}

// תגית קטנה בשם המחלקה - כדי לסמן בכל פריט פעילות (פגישה/משימה/מייל/
// וואטסאפ/פנייה) איזו מחלקה יצרה אותו, כשהטאב מציג את כל המחלקות יחד
function DeptTag({ name }) {
  if (!name) return null;
  return (
    <span style={{
      display: 'inline-block', background: 'var(--k-pill-bg)', color: 'var(--k-pill-text)', fontSize: 10.5, fontWeight: 600,
      borderRadius: 4, padding: '2px 6px', marginInlineEnd: 6, verticalAlign: 'middle',
    }}>
      {name}
    </span>
  );
}

// שורה בטאב "תהליכים" - כל תהליך (ראשי או קמפיין) עם השלב הנוכחי שלו,
// ואופציה לפתוח מחדש כשהוא הסתיים (חזרה לשלב הראשון בסדר ה-pipeline).
// היסטוריית התהליך עצמה לא נמחקת בשום שלב - זו רק פעולת קידום שלב רגילה.
function ProcessCard({ title, label, concluded, onReopen }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      border: '1px solid var(--k-border)', borderRadius: 8, padding: '10px 14px',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 2 }}>
          שלב נוכחי: <b style={{ color: concluded ? 'var(--k-ok-text)' : 'var(--k-text)' }}>{label}</b>
          {concluded && ' · תהליך הסתיים'}
        </div>
      </div>
      {concluded && (
        <button
          type="button"
          onClick={onReopen}
          style={{ background: 'none', border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: 'var(--k-text-muted)', cursor: 'pointer', flexShrink: 0 }}
        >
          ↺ פתיחה מחדש
        </button>
      )}
    </div>
  );
}

// כמו ProcessCard, אבל לתהליך-קמפיין: לחיצה-על-השורה פותחת/סוגרת StageStepper
// חי לשינוי-שלב - זה מה שעבר לכאן מגוף-הכרטיס (היה שם-תמיד-גלוי, עכשיו
// רק בטאב "תהליכים"), כדי לא לאבד את היכולת לשנות שלב-קמפיין מתוך הכרטיס.
function CampaignProcessCard({ cp, concluded, onReopen, onStageChange, disabled }) {
  const [open, setOpen] = useState(false);
  const label = cp.stages?.labels?.[cp.status] || cp.status;
  return (
    <div style={{ border: '1px solid var(--k-border)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'right', flex: 1 }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--k-text)' }}>🎯 קמפיין — {cp.campaignName}</div>
          <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginTop: 2 }}>
            שלב נוכחי: <b style={{ color: concluded ? 'var(--k-ok-text)' : 'var(--k-text)' }}>{label}</b>
            {concluded && ' · תהליך הסתיים'}
          </div>
        </button>
        {concluded ? (
          <button
            type="button"
            onClick={onReopen}
            style={{ background: 'none', border: '1px solid var(--k-border)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: 'var(--k-text-muted)', cursor: 'pointer', flexShrink: 0 }}
          >
            ↺ פתיחה מחדש
          </button>
        ) : (
          <button type="button" onClick={() => setOpen((v) => !v)} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--k-text-muted)', cursor: 'pointer', flexShrink: 0 }}>
            {open ? '▴ הסתרה' : '▾ שינוי שלב'}
          </button>
        )}
      </div>
      {open && !concluded && (
        <div style={{ marginTop: 10 }}>
          <StageStepper
            currentStage={cp.status}
            stages={cp.stages.order}
            labels={cp.stages.labels}
            colors={cp.stages.colors}
            disabled={disabled}
            action={(fd) => onStageChange(cp.rowId, fd)}
          />
        </div>
      )}
    </div>
  );
}

const ACTIVITY_GROUP_LIMIT = 4;

// קבוצת פריטים בטאב "פעילות" - נקראת רק עבור קטגוריות שיש בהן תוכן
// (קטגוריות ריקות מתמזגות לשורה אחת למעלה, ר' תנאי withContent/empty).
// מציגה כברירת מחדל רק את ה-4 האחרונים (הרשימות כבר מגיעות ממוינות
// מהחדש לישן), עם כפתור "הצג עוד" שמרחיב לרשימה המלאה.
function ActivityGroup({ title, items, renderItem }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, ACTIVITY_GROUP_LIMIT);
  const hiddenCount = items.length - visible.length;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(renderItem)}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 8, background: 'none', border: '1px solid var(--k-border)', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, color: 'var(--k-text-muted)', cursor: 'pointer',
          }}
        >
          הצג עוד ({hiddenCount})
        </button>
      )}
      {expanded && items.length > ACTIVITY_GROUP_LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            marginTop: 8, background: 'none', border: 'none', fontSize: 12, color: 'var(--k-text-muted)', cursor: 'pointer',
          }}
        >
          הצג פחות
        </button>
      )}
    </div>
  );
}
