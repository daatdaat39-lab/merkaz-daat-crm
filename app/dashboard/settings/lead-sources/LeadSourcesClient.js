'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createLeadSource, deleteLeadSource, updateCampaignRouting, disconnectEmailConnection } from './actions';

const PURPOSE_LABEL = { intake: 'מייל נכנס', send: 'מייל יוצא', call_recordings: 'הקלטות שיחה (015)' };

export default function LeadSourcesClient({ workspaces = [], connectionsByWorkspace = {}, connectionsByCampaign = {}, campaignsByWorkspace = {}, leadSourcesByWorkspace = {}, courses = [], webhookBase = null }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || '');
  const workspace = workspaces.find((w) => w.id === workspaceId);

  if (workspaces.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אינך מנהל אף מחלקה.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {workspaces.map((w) => (
          <button
            key={w.id}
            onClick={() => setWorkspaceId(w.id)}
            style={{
              border: workspaceId === w.id ? '1px solid var(--text)' : '1px solid var(--border, #e5e5e5)',
              background: workspaceId === w.id ? 'var(--text)' : 'var(--bg)',
              color: workspaceId === w.id ? '#fff' : 'var(--text)',
              borderRadius: 999, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', fontWeight: 500,
            }}
          >
            {w.name}
          </button>
        ))}
      </div>

      {/* key - כדי שבחירת הקורס תתאפס כשעוברים מחלקה */}
      <WebsiteWebhookSection key={workspaceId} workspace={workspace} courses={courses} webhookBase={webhookBase} />
      <EmailConnectionsSection workspace={workspace} connections={connectionsByWorkspace[workspaceId] || {}} />
      <CampaignRoutingSection
        workspace={workspace}
        campaigns={campaignsByWorkspace[workspaceId] || []}
        defaultConnections={connectionsByWorkspace[workspaceId] || {}}
        connectionsByCampaign={connectionsByCampaign}
      />
      <LeadSourcesSection key={`sources-${workspaceId}`} workspace={workspace} sources={leadSourcesByWorkspace[workspaceId] || []} courses={courses} />
    </div>
  );
}

function sectionCard() {
  return { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 };
}
function sectionHeader() {
  return { padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e5e5)', background: 'var(--bg-secondary, #f9f9f9)', fontSize: 13.5, fontWeight: 600 };
}

// מחולל כתובת Webhook לטפסי האתר (Elementor) - ר' api/webhooks/elementor-lead.
// המחלקה (והקורס, במחלקה שמוכרת קורסים) נקבעים לפי הכתובת שמדביקים בכל
// טופס, כך שדף נחיתה חדש לא דורש שינוי קוד.
function WebsiteWebhookSection({ workspace, courses, webhookBase }) {
  const [courseId, setCourseId] = useState('');
  const [copied, setCopied] = useState(false);

  const url = webhookBase
    ? `${webhookBase}&workspace_id=${workspace.id}${workspace.sells_courses && courseId ? `&course_id=${courseId}` : ''}`
    : '';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={sectionCard()}>
      <div style={sectionHeader()}>חיבור טפסי האתר (Elementor) - "{workspace.name}"</div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!webhookBase ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            החיבור עדיין לא הופעל בשרת (חסר המשתנה ELEMENTOR_WEBHOOK_SECRET).
          </div>
        ) : (
          <>
            {workspace.sells_courses && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
                הקורס של דף הנחיתה:
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle()}>
                  <option value="">דף כללי - קורס לא ידוע (למיון)</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                readOnly value={url} dir="ltr" onFocus={(e) => e.target.select()}
                style={{ ...inputStyle(), flex: 1, minWidth: 240, fontFamily: 'monospace', fontSize: 11.5 }}
              />
              <button type="button" onClick={handleCopy} style={primaryBtnSmall()}>{copied ? 'הועתק ✓' : 'העתקה'}</button>
            </div>
            {url.includes('localhost') && (
              <div style={{ fontSize: 11.5, color: 'var(--amber)' }}>
                הכתובת נבנתה מסביבת פיתוח מקומית - להעתקה לאתר יש לפתוח את המסך הזה במערכת החיה.
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              בעריכת הטופס באלמנטור: Actions After Submit ← הוספת Webhook ← להדביק את הכתובת, ולהפעיל Advanced Data.
              כל ליד שיישלח מהטופס ייכנס למחלקה הזו כ"ליד חדש". הכתובת כוללת מפתח סודי - לא לשתף אותה מחוץ להגדרות האתר.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// purpose='call_recordings' חורג מהתבנית "מייל למחלקה" - phone_calls
// אין לה workspace_id בכלל (מערכת טלפוניה גלובלית, לא מחולקת למחלקות),
// אז חיבור התיבה כאן תחת מחלקה ספציפית הוא רק נוחות UI (המסך הזה כבר
// מאורגן לפי מחלקה) - ה-cron שקורא ממנה (poll-call-recordings) לא
// מסנן/מתייחס למחלקה בכלל, רק מעדכן phone_calls לפי מספר טלפון+משך.
function EmailConnectionsSection({ workspace, connections }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDisconnect(id) {
    startTransition(async () => {
      await disconnectEmailConnection(id, workspace.id);
      router.refresh();
    });
  }

  return (
    <div style={sectionCard()}>
      <div style={sectionHeader()}>חיבורי מייל למחלקה "{workspace.name}"</div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['intake', 'send', 'call_recordings'].map((purpose) => {
          const conn = connections[purpose];
          return (
            <div key={purpose} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, width: 90 }}>{PURPOSE_LABEL[purpose]}</span>
              {conn ? (
                <>
                  <span style={{ fontSize: 12.5 }}>{conn.email_address}</span>
                  {conn.last_checked_at && purpose === 'intake' && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>נבדק לאחרונה: {new Date(conn.last_checked_at).toLocaleString('he-IL')}</span>
                  )}
                  <button type="button" onClick={() => handleDisconnect(conn.id)} disabled={isPending} style={dangerBtn()}>ניתוק</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>לא מחובר</span>
                  <a href={`/api/auth/gmail/start?workspace_id=${workspace.id}&purpose=${purpose}`} target="_blank" rel="noopener noreferrer" style={linkBtn()}>
                    חיבור עם Google
                  </a>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampaignRoutingSection({ workspace, campaigns, defaultConnections, connectionsByCampaign }) {
  return (
    <div style={sectionCard()}>
      <div style={sectionHeader()}>קמפיינים - ניתוב מייל</div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {campaigns.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>אין קמפיינים במחלקה זו</div>}
        {campaigns.map((c) => (
          <CampaignRoutingRow
            key={c.id}
            campaign={c}
            workspace={workspace}
            dedicatedConnection={connectionsByCampaign[c.id]}
            defaultIntakeConnection={defaultConnections.intake}
          />
        ))}
      </div>
    </div>
  );
}

function CampaignRoutingRow({ campaign, workspace, dedicatedConnection, defaultIntakeConnection }) {
  const [routeMatchText, setRouteMatchText] = useState(campaign.route_match_text || '');
  const [useDefault, setUseDefault] = useState(!!campaign.email_connection_id);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateCampaignRouting(campaign.id, workspace.id, {
        emailConnectionId: useDefault ? defaultIntakeConnection?.id : null,
        routeMatchText: useDefault ? routeMatchText : null,
      });
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{campaign.name}</div>

      {dedicatedConnection ? (
        <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          תיבה ייעודית: {dedicatedConnection.email_address}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <a
              href={`/api/auth/gmail/start?workspace_id=${workspace.id}&purpose=intake&campaign_id=${campaign.id}`}
              target="_blank" rel="noopener noreferrer" style={linkBtn()}
            >
              📩 חיבור תיבה ייעודית לקמפיין
            </a>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>או:</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginBottom: 6 }}>
            <input type="checkbox" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} disabled={!defaultIntakeConnection} />
            להשתמש בתיבת ברירת המחדל של המחלקה{!defaultIntakeConnection && ' (עדיין לא מחוברת)'}
          </label>
          {useDefault && (
            <input
              type="text" value={routeMatchText} onChange={(e) => setRouteMatchText(e.target.value)}
              placeholder="קישור/מילה שמופיעים במייל - רק מיילים שמכילים את זה ישויכו לקמפיין"
              style={{ width: '100%', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, marginBottom: 8, boxSizing: 'border-box' }}
            />
          )}
          <button type="button" onClick={handleSave} disabled={isPending} style={primaryBtnSmall()}>
            {isPending ? 'שומר...' : 'שמירה'}
          </button>
          {error && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 6 }}>{error}</div>}
        </>
      )}
    </div>
  );
}

function LeadSourcesSection({ workspace, sources, courses = [] }) {
  const [name, setName] = useState('');
  const [linkPattern, setLinkPattern] = useState('');
  const [courseId, setCourseId] = useState('');
  const courseNames = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await createLeadSource(workspace.id, { name, linkPattern, courseId: workspace.sells_courses ? courseId || null : null });
      if (res?.error) { setError(res.error); return; }
      setName(''); setLinkPattern(''); setCourseId('');
      router.refresh();
    });
  }

  function handleDelete(id) {
    startTransition(async () => {
      await deleteLeadSource(id, workspace.id);
      router.refresh();
    });
  }

  return (
    <div style={sectionCard()}>
      <div style={sectionHeader()}>רשימת מקורות - "{workspace.name}"</div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {sources.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>אין מקורות מוגדרים</div>}
          {sources.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, minWidth: 100 }}>{s.name}</span>
              <span dir="ltr" style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{s.link_pattern || '—'}</span>
              {s.course_id && <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>קורס: {courseNames[s.course_id] || 'לא פעיל'}</span>}
              <button type="button" onClick={() => handleDelete(s.id)} disabled={isPending} style={dangerBtn()}>מחיקה</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם המקור (למשל: עומרי)" style={{ ...inputStyle(), width: 160 }} />
          <input value={linkPattern} onChange={(e) => setLinkPattern(e.target.value)} placeholder="כתובת דף הנחיתה או חלק ממנה (אופציונלי)" dir="ltr" style={{ ...inputStyle(), flex: 1, minWidth: 200 }} />
          {workspace.sells_courses && (
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle()} title="הקורס שאליו ישויכו לידים מהדף הזה">
              <option value="">בלי קורס (למיון)</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button type="button" onClick={handleAdd} disabled={isPending || !name.trim()} style={primaryBtnSmall()}>הוספה</button>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}

function inputStyle() {
  return { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, boxSizing: 'border-box' };
}
function linkBtn() {
  return { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, textDecoration: 'none', cursor: 'pointer' };
}
function primaryBtnSmall() {
  return { background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' };
}
function dangerBtn() {
  return { background: 'none', border: '1px solid var(--border, #e5e5e5)', color: 'var(--red)', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer' };
}
