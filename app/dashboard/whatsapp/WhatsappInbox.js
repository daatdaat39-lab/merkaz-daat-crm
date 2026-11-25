'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { sendContactWhatsApp, sendContactWhatsAppChatMessage, searchContacts } from '../contacts/actions';
import { openConversation, claimConversation, assignConversation, markConversationDone, linkConversationToContact } from './actions';
import AddContactForm from '../contacts/AddContactForm';
import { initials } from '../components/ui';
import { serviceWindow, waitingInfo, WAIT_ALERT_MINUTES } from '../lib/whatsappTime';

const HEALTH_STALE_MS = 15 * 60 * 1000;
const NO_CONTACT_ID = '00000000-0000-0000-0000-000000000000';

const WAIT_COLORS = {
  ok: { color: 'var(--k-text-muted)', background: 'var(--k-pill-bg)' },
  warn: { color: 'var(--k-caution-text)', background: 'var(--k-caution-bg)' },
  alert: { color: 'var(--k-danger-text)', background: 'var(--k-danger-bg)' },
};
const chip = (active) => ({
  fontSize: 11.5, borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
  border: `1px solid ${active ? 'var(--k-text)' : 'var(--k-border)'}`,
  background: active ? 'var(--k-text)' : 'var(--k-surface)', color: active ? 'var(--k-bg)' : 'var(--k-text-muted)',
});
const smallBtn = { fontSize: 11.5, fontWeight: 600, border: '1px solid var(--k-border)', background: 'var(--k-surface)', color: 'var(--k-text)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer' };
const fieldStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' };

function displayName(c) {
  return c.contacts ? `${c.contacts.first || ''} ${c.contacts.last || ''}`.trim() || c.phone : c.phone;
}
function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

// מסך השיחות: רשימה + שיחה פתוחה. כל המחלקה רואה את כל שיחות המחלקה, עם
// סימון הנציג המטפל; "לא נקרא" הוא אישי לכל נציג, ו"ממתין" נקבע לפי מענה.
export default function WhatsappInbox({ userId, conversations, readAtByConversation, agentNames, agentsByWorkspace, myWorkspaces, managedWorkspaceIds, allWorkspaces, defaultWorkspaceId, templates, quickReplies, health, initialConversationId }) {
  const [tab, setTab] = useState('waiting');
  const [filter, setFilter] = useState('all');
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [thread, setThread] = useState({ id: null, messages: [], senderNames: {}, loading: false, error: '' });
  const [localReads, setLocalReads] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [narrow, setNarrow] = useState(false);
  const router = useRouter();
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const mq = window.matchMedia('(max-width: 760px)');
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => { clearInterval(timer); mq.removeEventListener('change', onChange); };
  }, []);

  const loadThread = useCallback(async (id) => {
    setThread((prev) => ({ ...(prev.id === id ? prev : { messages: [], senderNames: {} }), id, loading: true, error: '' }));
    const res = await openConversation(id);
    if (selectedRef.current !== id) return;
    if (res?.error) { setThread({ id, messages: [], senderNames: {}, loading: false, error: res.error }); return; }
    setThread({ id, messages: res.messages, senderNames: res.senderNames, loading: false, error: '' });
    setLocalReads((prev) => ({ ...prev, [id]: new Date().toISOString() }));
  }, []);

  useEffect(() => {
    if (selectedId) loadThread(selectedId);
  }, [selectedId, loadThread]);

  // רענון חי: כל שינוי בשיחה (הודעה חדשה, מענה, שינוי בעלים) מרענן את
  // הרשימה, ואם זו השיחה הפתוחה - גם את ההודעות שלה.
  useEffect(() => {
    const supabase = createClient();
    let timer = null;
    const channel = supabase
      .channel('whatsapp-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, (payload) => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 600);
        if (payload.new?.id && payload.new.id === selectedRef.current) loadThread(payload.new.id);
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [router, loadThread]);

  const isUnread = useCallback((c) => {
    if (!c.last_inbound_at || c.last_direction !== 'in') return false;
    const readAt = localReads[c.id] || readAtByConversation[c.id];
    return !readAt || new Date(c.last_inbound_at) > new Date(readAt);
  }, [localReads, readAtByConversation]);

  const waitingAll = useMemo(() => conversations.filter((c) => c.status === 'waiting_us'), [conversations]);
  const counts = useMemo(() => ({
    waiting: waitingAll.length,
    mine: waitingAll.filter((c) => c.assigned_to === userId).length,
    unassigned: waitingAll.filter((c) => !c.assigned_to).length,
    overdue: waitingAll.filter((c) => (waitingInfo(c.waiting_since, now)?.minutes || 0) >= WAIT_ALERT_MINUTES).length,
  }), [waitingAll, userId, now]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (tab === 'waiting' ? waitingAll : conversations).filter((c) => {
      if (workspaceFilter && c.workspace_id !== workspaceFilter) return false;
      if (filter === 'mine' && c.assigned_to !== userId) return false;
      if (filter === 'unassigned' && c.assigned_to) return false;
      if (filter === 'overdue' && !(c.status === 'waiting_us' && (waitingInfo(c.waiting_since, now)?.minutes || 0) >= WAIT_ALERT_MINUTES)) return false;
      if (q && !`${displayName(c)} ${c.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // ממתינים: מי שמחכה הכי הרבה זמן - ראשון. כל השיחות: האחרונה - ראשונה.
    return tab === 'waiting'
      ? [...rows].sort((a, b) => new Date(a.waiting_since || a.last_message_at) - new Date(b.waiting_since || b.last_message_at))
      : [...rows].sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  }, [tab, waitingAll, conversations, workspaceFilter, filter, userId, now, search]);

  const selected = conversations.find((c) => c.id === selectedId) || null;
  const healthStale = health?.last_success_at && now - new Date(health.last_success_at).getTime() > HEALTH_STALE_MS;

  const showList = !narrow || !selected;
  const showPane = !narrow || !!selected;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 62px)', background: 'var(--k-bg)' }}>
      {healthStale && (
        <div style={{ background: 'var(--k-danger-bg)', color: 'var(--k-danger-text)', fontSize: 12.5, fontWeight: 600, padding: '8px 16px' }}>
          ⚠ ייתכן שהודעות חדשות לא נכנסות: המשיכה האחרונה מ-InforU הצליחה ב-{new Date(health.last_success_at).toLocaleString('he-IL')}
          {health.last_error ? ` (שגיאה אחרונה: ${health.last_error})` : ''}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {showList && (
          <div style={{ width: narrow ? '100%' : 350, flexShrink: 0, borderInlineEnd: '1px solid var(--k-border)', display: 'flex', flexDirection: 'column', background: 'var(--k-surface)', minHeight: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--k-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 19, color: 'var(--k-text)' }}>WhatsApp</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setTab('waiting')} style={chip(tab === 'waiting')}>ממתינים לתגובה ({counts.waiting})</button>
                <button type="button" onClick={() => setTab('all')} style={chip(tab === 'all')}>כל השיחות</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setFilter('all')} style={chip(filter === 'all')}>כל המחלקה</button>
                <button type="button" onClick={() => setFilter('mine')} style={chip(filter === 'mine')}>שלי ({counts.mine})</button>
                <button type="button" onClick={() => setFilter('unassigned')} style={chip(filter === 'unassigned')}>בלי נציג ({counts.unassigned})</button>
                <button type="button" onClick={() => setFilter('overdue')} style={chip(filter === 'overdue')}>מעל שעה ({counts.overdue})</button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש שם או טלפון" style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
                {myWorkspaces.length > 1 && (
                  <select value={workspaceFilter} onChange={(e) => setWorkspaceFilter(e.target.value)} style={{ ...fieldStyle, maxWidth: 130 }}>
                    <option value="">כל המחלקות</option>
                    {myWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {list.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)', textAlign: 'center', padding: '36px 16px' }}>
                  {tab === 'waiting' ? 'אין שיחות שממתינות לתגובה' : 'אין שיחות להצגה'}
                </div>
              )}
              {list.map((c) => {
                const wait = c.status === 'waiting_us' ? waitingInfo(c.waiting_since, now) : null;
                const unread = isUnread(c);
                return (
                  <button
                    key={c.id} type="button" onClick={() => setSelectedId(c.id)}
                    style={{
                      display: 'flex', gap: 10, width: '100%', textAlign: 'right', padding: '10px 14px', cursor: 'pointer',
                      border: 'none', borderBottom: '1px solid var(--k-border)',
                      background: c.id === selectedId ? 'var(--k-pill-bg)' : 'transparent', color: 'var(--k-text)',
                    }}
                  >
                    <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      {c.contacts ? initials(c.contacts.first, c.contacts.last) : '?'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13.5, fontWeight: unread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(c)}</span>
                        {unread && <span title="לא נקרא" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--k-accent)', flexShrink: 0 }} />}
                        <span style={{ marginInlineStart: 'auto', fontSize: 10.5, color: 'var(--k-text-muted)', flexShrink: 0 }}>{timeLabel(c.last_message_at)}</span>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--k-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.last_direction === 'out' ? 'אנחנו: ' : ''}{c.last_message_preview || ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--k-text-muted)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.contacts ? (c.workspaces?.name || 'בלי מחלקה') : 'מספר לא מזוהה'} · {c.assigned_to ? (c.assigned_to === userId ? 'אני' : agentNames[c.assigned_to] || 'נציג') : 'בלי נציג'}
                        </span>
                        {wait && <span style={{ ...WAIT_COLORS[wait.level], marginInlineStart: 'auto', borderRadius: 100, padding: '1px 8px', fontWeight: 600, flexShrink: 0 }}>{wait.label}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showPane && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {selected ? (
              <ConversationPane
                key={selected.id}
                conversation={selected} thread={thread} now={now} userId={userId} narrow={narrow}
                agentNames={agentNames}
                agents={agentsByWorkspace[selected.workspace_id] || []}
                canAssign={!!selected.workspace_id && managedWorkspaceIds.includes(selected.workspace_id)}
                templates={templates.filter((t) => !t.workspace_id || t.workspace_id === selected.workspace_id)}
                quickReplies={quickReplies}
                allWorkspaces={allWorkspaces} defaultWorkspaceId={defaultWorkspaceId}
                onBack={() => setSelectedId(null)}
                onChanged={() => { loadThread(selected.id); router.refresh(); }}
              />
            ) : (
              <div style={{ margin: 'auto', fontSize: 13, color: 'var(--k-text-muted)' }}>בחר/י שיחה מהרשימה</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPane({ conversation: c, thread, now, userId, narrow, agentNames, agents, canAssign, templates, quickReplies, allWorkspaces, defaultWorkspaceId, onBack, onChanged }) {
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateReason, setTemplateReason] = useState('פנייתך');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef(null);

  const windowState = serviceWindow(c.last_inbound_at, now);
  const wait = c.status === 'waiting_us' ? waitingInfo(c.waiting_since, now) : null;
  const template = templates.find((t) => t.id === templateId) || null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.messages.length, thread.id]);

  // try/catch מפורש - חריגה לא-תפוסה בתוך startTransition מפילה את כל המסך
  function run(action) {
    setError('');
    startTransition(async () => {
      try {
        const res = await action();
        if (res?.error) { setError(res.error); return; }
        onChanged();
      } catch (e) {
        setError(e?.message || 'הפעולה נכשלה');
      }
    });
  }

  function sendText() {
    const body = text.trim();
    if (!body || !windowState.open) return;
    run(async () => {
      const res = await sendContactWhatsAppChatMessage(c.contact_id, c.workspace_id, body, c.contact_department_id, c.phone);
      if (!res?.error) setText('');
      return res;
    });
  }

  function sendTemplate() {
    if (!template) return;
    run(() => sendContactWhatsApp(c.contact_id, c.workspace_id, templateReason.trim() || 'פנייתך', template.template_id, c.contact_department_id, c.phone));
  }

  return (
    <>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--k-border)', background: 'var(--k-surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {narrow && <button type="button" onClick={onBack} style={smallBtn}>→ לרשימה</button>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 17, color: 'var(--k-text)' }}>
            {c.contact_id ? <Link href={`/dashboard/contacts/${c.contact_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{displayName(c)}</Link> : 'מספר לא מזוהה'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>
            <bdi dir="ltr">{c.phone}</bdi>{c.workspaces?.name ? ` · ${c.workspaces.name}` : ''}
            {' · '}נציג: {c.assigned_to ? (c.assigned_to === userId ? 'אני' : agentNames[c.assigned_to] || 'נציג') : 'אין'}
          </div>
        </div>
        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {wait && <span style={{ ...WAIT_COLORS[wait.level], fontSize: 11.5, fontWeight: 600, borderRadius: 100, padding: '2px 10px' }}>{wait.label}</span>}
          {c.contact_department_id && <Link href={`/dashboard/sales/leads/${c.contact_department_id}`} style={{ ...smallBtn, textDecoration: 'none' }}>מסך הליד</Link>}
          {c.assigned_to !== userId && (
            <button type="button" disabled={isPending} onClick={() => run(() => claimConversation(c.id))} style={smallBtn}>אני מטפל</button>
          )}
          {canAssign && (
            <select value={c.assigned_to || ''} disabled={isPending} onChange={(e) => run(() => assignConversation(c.id, e.target.value || null))} style={{ ...fieldStyle, padding: '4px 8px', fontSize: 11.5 }} title="העברה לנציג">
              <option value="">בלי נציג</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {c.status === 'waiting_us' && (
            <button type="button" disabled={isPending} onClick={() => run(() => markConversationDone(c.id))} style={smallBtn} title="מוציא את השיחה מרשימת הממתינים בלי לשלוח תשובה">✓ טופל, לא דורש מענה</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        {thread.loading && thread.messages.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)', textAlign: 'center' }}>טוען...</div>}
        {thread.error && <div style={{ fontSize: 12.5, color: 'var(--k-danger-text)', textAlign: 'center' }}>{thread.error}</div>}
        {thread.messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'in' ? 'flex-start' : 'flex-end' }}>
            <div style={{
              maxWidth: '75%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              background: m.direction === 'in' ? 'var(--k-surface)' : 'var(--k-ok-bg)',
              color: m.direction === 'in' ? 'var(--k-text)' : 'var(--k-ok-text)',
              border: m.direction === 'in' ? '1px solid var(--k-border)' : 'none',
            }}>
              <div>{m.kind === 'template' ? `📨 ${m.message || `הודעת תבנית${m.reason ? ` - ${m.reason}` : ''}`}` : m.message}</div>
              <div style={{ fontSize: 10, color: 'var(--k-text-muted)', marginTop: 4, textAlign: 'left' }}>
                {m.direction === 'out' && m.sent_by ? `${thread.senderNames[m.sent_by] || 'נציג'} · ` : ''}
                {new Date(m.sent_at).toLocaleDateString('he-IL')} {new Date(m.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ padding: '6px 16px', color: 'var(--k-danger-text)', fontSize: 12.5 }}>שגיאה: {error}</div>}

      {!c.contact_id ? (
        <UnknownSenderPanel conversation={c} allWorkspaces={allWorkspaces} defaultWorkspaceId={defaultWorkspaceId} onLinked={onChanged} />
      ) : (
        <div style={{ borderTop: '1px solid var(--k-border)', background: 'var(--k-surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: windowState.open ? 'var(--k-ok-text)' : 'var(--k-caution-text)' }}>
            {windowState.open ? '🟢' : '🔒'} {windowState.label}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={!windowState.open || isPending}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
              placeholder={windowState.open ? 'כתיבת תשובה... (Enter לשליחה, Shift+Enter לשורה חדשה)' : 'טקסט חופשי לא זמין כרגע - יש לשלוח תבנית'}
              style={{ ...fieldStyle, flex: 1, minWidth: 0, fontSize: 13, resize: 'none', fontFamily: 'inherit', opacity: windowState.open ? 1 : 0.6 }}
            />
            <button type="button" onClick={sendText} disabled={!windowState.open || isPending || !text.trim()} style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', opacity: !windowState.open || isPending || !text.trim() ? 0.5 : 1 }}>
              {isPending ? 'שולח...' : 'שליחה'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {windowState.open && quickReplies.length > 0 && (
              <select value="" onChange={(e) => { const q = quickReplies.find((r) => r.id === e.target.value); if (q) setText(q.body || ''); }} style={{ ...fieldStyle, fontSize: 11.5, maxWidth: 200 }}>
                <option value="">תשובה מהירה...</option>
                {quickReplies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>📨 תבנית:</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ ...fieldStyle, fontSize: 11.5, maxWidth: 200, borderColor: windowState.open ? 'var(--k-border)' : 'var(--k-accent)' }}>
              <option value="">בחירת תבנית...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {template && (
              <>
                <input value={templateReason} onChange={(e) => setTemplateReason(e.target.value)} title="הנושא שמשולב בתבנית" style={{ ...fieldStyle, fontSize: 11.5, width: 130 }} />
                <button type="button" onClick={sendTemplate} disabled={isPending} style={smallBtn}>שליחת תבנית</button>
              </>
            )}
          </div>
          {template?.preview_text && (
            <div style={{ fontSize: 11.5, color: 'var(--k-text-muted)', background: 'var(--k-pill-bg)', borderRadius: 8, padding: '6px 10px', whiteSpace: 'pre-wrap' }}>
              <b style={{ color: 'var(--k-text)' }}>תצוגה מקדימה: </b>{template.preview_text}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// מספר שלא שייך לאף איש קשר: אי אפשר לענות לו עד שמקשרים אותו לאיש קשר
// קיים או יוצרים חדש (כל שליחה במערכת שייכת לאיש קשר).
function UnknownSenderPanel({ conversation: c, allWorkspaces, defaultWorkspaceId, onLinked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    if (query.trim().length < 2) return;
    setError('');
    startTransition(async () => {
      try {
        setResults(await searchContacts(query.trim(), NO_CONTACT_ID));
      } catch (e) {
        setError(e?.message || 'החיפוש נכשל');
      }
    });
  }

  function handleLink(contactId) {
    setError('');
    startTransition(async () => {
      const res = await linkConversationToContact(c.id, contactId);
      if (res?.error) { setError(res.error); return; }
      onLinked();
    });
  }

  return (
    <div style={{ borderTop: '1px solid var(--k-border)', background: 'var(--k-surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--k-text-muted)' }}>המספר הזה לא שייך לאף איש קשר. כדי לענות, יש לקשר אותו לאיש קשר קיים או ליצור חדש.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} placeholder="חיפוש איש קשר קיים (שם / טלפון / מייל)" style={{ ...fieldStyle, flex: 1, minWidth: 200 }} />
        <button type="button" onClick={handleSearch} disabled={isPending || query.trim().length < 2} style={smallBtn}>חיפוש</button>
        <AddContactForm
          label="+ יצירת איש קשר" modalTitle="יצירת איש קשר מהודעת WhatsApp"
          workspaces={allWorkspaces} defaultWorkspaceId={defaultWorkspaceId}
          defaultPhone={c.phone} linkWhatsappPhone={c.phone}
        />
      </div>
      {results.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--k-text)' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{r.first} {r.last}{r.phone ? ` · ${r.phone}` : ''}</span>
          <button type="button" onClick={() => handleLink(r.id)} disabled={isPending} style={smallBtn}>קישור לשיחה הזו</button>
        </div>
      ))}
      {error && <div style={{ fontSize: 12, color: 'var(--k-danger-text)' }}>{error}</div>}
    </div>
  );
}
