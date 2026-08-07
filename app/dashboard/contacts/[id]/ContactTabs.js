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

export default function ContactTabs({ meetings, tasks, notes, contactId, toggleTaskAction, updateNotesAction, frozen, inquiries = [], sentEmails = [], sentWhatsapp = [], donationTransactions = [], commitments = [], callHistory = [], agents = [], workspaceNameById = {}, phoneCalls = [], activeDepartment = null, pipeline = null, mainProcessConcluded = false, onReopenMain, onReopenCampaign, isManager = false }) {
  const [tab, setTab] = useState('activity');
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
  const tabs = [
    { id: 'activity', label: 'פעילות' },
    { id: 'tasks', label: `משימות${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'notes', label: 'הערות' },
    { id: 'documents', label: 'מסמכים' },
    { id: 'recordings', label: 'הקלטות שיחה' },
    ...(activeDepartment ? [{ id: 'processes', label: 'תהליכים' }] : []),
    ...(visibleFieldDefs.length > 0 ? [{ id: 'fields', label: `שדות נוספים — ${activeDepartment.workspaceName}` }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', gap: 18, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
              fontSize: 13, color: tab === t.id ? '#0a0a0a' : '#9b9b9b',
              borderBottom: tab === t.id ? '2px solid #0a0a0a' : '2px solid transparent',
              fontWeight: tab === t.id ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'activity' && (() => {
        const groups = [
          {
            key: 'inquiries', title: 'היסטוריית פניות — כל המחלקות', shortLabel: 'פניות', items: inquiries,
            renderItem: (inq, i) => (
              <div key={i} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={inq.workspaceName} />
                <span style={{ color: '#333' }}>{inq.reason}</span>
                {inq.note && <span style={{ color: '#9b9b9b' }}> — {inq.note}</span>}
                <span style={{ color: '#c0c0c0' }}> · {new Date(inq.created_at).toLocaleDateString('he-IL')}</span>
              </div>
            ),
          },
          {
            key: 'emails', title: 'מיילים שנשלחו — כל המחלקות', shortLabel: 'מיילים', items: sentEmails,
            renderItem: (e) => (
              <div key={e.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={workspaceNameById[e.workspace_id]} />
                <div style={{ fontWeight: 500 }}>{e.subject}</div>
                <div style={{ color: '#9b9b9b', marginTop: 2 }}>
                  מאת {e.from_address} · {new Date(e.sent_at).toLocaleDateString('he-IL')} {new Date(e.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ),
          },
          {
            key: 'whatsapp', title: 'הודעות WhatsApp — כל המחלקות', shortLabel: 'הודעות WhatsApp', items: sentWhatsapp,
            renderItem: (w) => (
              <div key={w.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={workspaceNameById[w.workspace_id]} />
                <div style={{ fontWeight: 500 }}>
                  {w.direction === 'in' ? '⬅️ מהלקוח: ' : '➡️ נשלח: '}
                  {w.kind === 'chat' ? w.message : `הודעת תבנית${w.reason ? ` — ${w.reason}` : ''}`}
                </div>
                <div style={{ color: '#9b9b9b', marginTop: 2 }}>
                  {w.phone} · {new Date(w.sent_at).toLocaleDateString('he-IL')} {new Date(w.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ),
          },
          {
            key: 'donations', title: 'תרומות', shortLabel: 'תרומות', items: donationTransactions,
            renderItem: (t) => (
              <div key={t.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <DeptTag name={workspaceNameById[t.workspace_id]} />
                <span style={{ fontWeight: 600, color: '#15803d' }}>₪{Number(t.amount).toLocaleString('he-IL')}</span>
                <span style={{ color: '#c0c0c0' }}> · {new Date(t.transaction_date).toLocaleDateString('he-IL')}</span>
                {t.source_system && <span style={{ color: '#9b9b9b' }}> · {t.source_system}</span>}
              </div>
            ),
          },
          {
            key: 'call_history', title: 'היסטוריית שיחות (מיובאת)', shortLabel: 'היסטוריית שיחות', items: callHistory,
            renderItem: (c) => (
              <div key={c.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>📞 {c.response_text || 'שיחה'}</span>
                {c.call_date && <span style={{ color: '#c0c0c0' }}> · {new Date(c.call_date).toLocaleDateString('he-IL')}</span>}
                {c.source_system && <span style={{ color: '#9b9b9b' }}> · {c.source_system}</span>}
              </div>
            ),
          },
          {
            key: 'phone_calls', title: 'שיחות טלפון (015)', shortLabel: 'שיחות טלפון', items: phoneCalls,
            renderItem: (c) => (
              <div key={c.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>{c.direction === 'out' ? '📤 יוצאת' : '📥 נכנסת'}</span>
                <span> · {c.answered ? 'נענתה' : 'לא נענתה'}</span>
                {c.duration_seconds ? <span style={{ color: '#9b9b9b' }}> · {Math.round(c.duration_seconds / 60)} דק'</span> : null}
                {c.started_at && <span style={{ color: '#c0c0c0' }}> · {new Date(c.started_at).toLocaleDateString('he-IL')} {new Date(c.started_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
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
              <div key={m.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px' }}>
                <DeptTag name={workspaceNameById[m.workspace_id]} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title || 'פגישה'}</div>
                <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 3 }}>
                  {new Date(m.meeting_date).toLocaleDateString('he-IL')} · {m.meeting_time?.slice(0, 5)} · {m.type}
                  {m.location ? ` · ${m.location}` : ''}
                </div>
                {m.type === 'זום' && m.zoom_join_url && (
                  <a href={m.zoom_join_url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 11.5, color: '#2563eb', marginTop: 4 }}>🔗 קישור Zoom</a>
                )}
                {m.notes && <div style={{ fontSize: 12.5, marginTop: 6, color: '#333' }}>{m.notes}</div>}
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
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>
                כאן תראה: {empty.map((g) => g.shortLabel).join(' · ')}
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>שגיאה: {error}</div>}

          {!frozen && (addingTask ? (
            <form action={handleAddTask} style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', border: '1px solid #e5e5e5',
              borderRadius: 8, padding: '10px 12px', background: '#f9f9f9',
            }}>
              <input
                name="title" placeholder="כותרת המשימה..." autoFocus required
                style={{ flex: '1 1 160px', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}
              />
              <input name="due_date" type="date" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }} />
              <input name="due_time" type="time" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }} />
              {agents.length > 0 && (
                <select name="assigned_to" style={{ border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 }}>
                  <option value="">אני</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <button type="submit" disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
                הוספה
              </button>
              <button type="button" onClick={() => setAddingTask(false)} style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
                ביטול
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              style={{ alignSelf: 'flex-start', background: 'var(--bg)', border: '1px dashed #d0d0d0', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, color: '#666', cursor: 'pointer' }}
            >
              + משימה חדשה
            </button>
          ))}

          {tasks.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין משימות</div>}
          {tasks.map((t) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e5e5e5',
              borderRadius: 8, padding: '9px 14px',
            }}>
              <button
                onClick={() => handleToggleTask(t.id, !t.done)}
                disabled={isPending || frozen}
                style={{
                  width: 18, height: 18, borderRadius: 4, border: '1px solid #d0d0d0',
                  background: t.done ? '#16a34a' : '#fff', color: '#fff', fontSize: 11,
                  cursor: frozen ? 'default' : 'pointer', flexShrink: 0, opacity: frozen ? 0.5 : 1,
                }}
              >
                {t.done ? '✓' : ''}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9b9b9b' : '#0a0a0a' }}>
                  <DeptTag name={workspaceNameById[t.workspace_id]} />
                  {t.title}
                </div>
                {t.due_date && (
                  <div style={{ fontSize: 11, color: '#9b9b9b' }}>יעד: {new Date(t.due_date).toLocaleDateString('he-IL')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'notes' && (
        <form action={handleSaveNotes} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ color: '#b23b2f', fontSize: 12 }}>שגיאה: {error}</div>}
          <textarea
            name="notes"
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={8}
            disabled={frozen}
            style={{
              width: '100%', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12,
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            }}
            placeholder="הערות פנימיות על איש הקשר..."
          />
          <button type="submit" disabled={isPending || frozen} style={{
            alignSelf: 'flex-start', background: '#0a0a0a', color: '#fff', border: 'none',
            borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: frozen ? 'default' : 'pointer', opacity: frozen ? 0.5 : 1,
          }}>
            שמירת הערות
          </button>
        </form>
      )}

      {tab === 'processes' && activeDepartment && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ProcessCard
            title={`תהליך ראשי — ${activeDepartment.workspaceName}`}
            label={pipeline?.labels?.[activeDepartment.stage] || activeDepartment.stage}
            concluded={mainProcessConcluded}
            onReopen={onReopenMain}
          />
          {(activeDepartment.campaignProcesses || []).map((cp) => (
            <ProcessCard
              key={cp.rowId}
              title={`קמפיין — ${cp.campaignName}`}
              label={cp.stages?.labels?.[cp.status] || cp.status}
              concluded={isProcessConcluded(cp.status, cp.stages)}
              onReopen={() => onReopenCampaign(cp.rowId, cp.stages)}
            />
          ))}
        </div>
      )}

      {tab === 'fields' && activeDepartment && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          <KesherProjectPanel
            workspaceName={activeDepartment.workspaceName}
            commitments={deptCommitments}
            extraValues={extraValues}
          />
          {visibleFieldDefs.map((f) => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{f.label}</label>
              {f.type === 'computed' ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '7px 0' }}>{computeFieldValue(f, extraValues, fieldDefs, deptTransactions) || '—'}</div>
              ) : f.type === 'select' ? (
                <select
                  value={extraValues[f.key] || ''}
                  onChange={(e) => handleExtraFieldChange(f.key, e.target.value)}
                  disabled={frozen}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
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
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div style={{ fontSize: 13, color: '#9b9b9b', marginBottom: 10 }}>אין מסמכים</div>
          <NotConnectedButton
            label="העלאת מסמך"
            icon="📎"
            message="העלאת תעודת בגרות / גיליון ציונים — עדיין לא מחובר"
          />
        </div>
      )}

      {tab === 'recordings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phoneCalls.filter((c) => c.recording_url).length === 0 && (
            <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין הקלטות שיחה</div>
          )}
          {phoneCalls.filter((c) => c.recording_url).map((c) => (
            <div key={c.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12.5, marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>{c.direction === 'out' ? '📤 יוצאת' : '📥 נכנסת'}</span>
                {c.started_at && <span style={{ color: '#9b9b9b' }}> · {new Date(c.started_at).toLocaleDateString('he-IL')} {new Date(c.started_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
              <audio controls src={c.recording_url} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// תגית קטנה בשם המחלקה - כדי לסמן בכל פריט פעילות (פגישה/משימה/מייל/
// וואטסאפ/פנייה) איזו מחלקה יצרה אותו, כשהטאב מציג את כל המחלקות יחד
function DeptTag({ name }) {
  if (!name) return null;
  return (
    <span style={{
      display: 'inline-block', background: '#eef2f7', color: '#3b5878', fontSize: 10.5, fontWeight: 600,
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
      border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 2 }}>
          שלב נוכחי: <b style={{ color: concluded ? '#15803d' : '#0a0a0a' }}>{label}</b>
          {concluded && ' · תהליך הסתיים'}
        </div>
      </div>
      {concluded && (
        <button
          type="button"
          onClick={onReopen}
          style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#6b6b6b', cursor: 'pointer', flexShrink: 0 }}
        >
          ↺ פתיחה מחדש
        </button>
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
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(renderItem)}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 8, background: 'none', border: '1px solid #e5e5e5', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, color: '#6b6b6b', cursor: 'pointer',
          }}
        >
          הצג עוד ({hiddenCount})
        </button>
      )}
      {expanded && items.length > ACTIVITY_GROUP_LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            marginTop: 8, background: 'none', border: 'none', fontSize: 12, color: '#6b6b6b', cursor: 'pointer',
          }}
        >
          הצג פחות
        </button>
      )}
    </div>
  );
}
