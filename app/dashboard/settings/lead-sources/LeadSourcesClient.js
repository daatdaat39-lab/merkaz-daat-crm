'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createLeadSource, deleteLeadSource, updateCampaignRouting, disconnectEmailConnection } from './actions';

const PURPOSE_LABEL = { intake: 'מייל נכנס', send: 'מייל יוצא' };

export default function LeadSourcesClient({ workspaces = [], connectionsByWorkspace = {}, connectionsByCampaign = {}, campaignsByWorkspace = {}, leadSourcesByWorkspace = {} }) {
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
              border: workspaceId === w.id ? '1px solid #0a0a0a' : '1px solid var(--border, #e5e5e5)',
              background: workspaceId === w.id ? '#0a0a0a' : 'var(--bg)',
              color: workspaceId === w.id ? '#fff' : '#333',
              borderRadius: 999, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', fontWeight: 500,
            }}
          >
            {w.name}
          </button>
        ))}
      </div>

      <EmailConnectionsSection workspace={workspace} connections={connectionsByWorkspace[workspaceId] || {}} />
      <CampaignRoutingSection
        workspace={workspace}
        campaigns={campaignsByWorkspace[workspaceId] || []}
        defaultConnections={connectionsByWorkspace[workspaceId] || {}}
        connectionsByCampaign={connectionsByCampaign}
      />
      <LeadSourcesSection workspace={workspace} sources={leadSourcesByWorkspace[workspaceId] || []} />
    </div>
  );
}

function sectionCard() {
  return { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 };
}
function sectionHeader() {
  return { padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e5e5)', background: 'var(--bg-secondary, #f9f9f9)', fontSize: 13.5, fontWeight: 600 };
}

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
        {['intake', 'send'].map((purpose) => {
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
          {error && <div style={{ color: '#b23b2f', fontSize: 11.5, marginTop: 6 }}>{error}</div>}
        </>
      )}
    </div>
  );
}

function LeadSourcesSection({ workspace, sources }) {
  const [name, setName] = useState('');
  const [linkPattern, setLinkPattern] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await createLeadSource(workspace.id, { name, linkPattern });
      if (res?.error) { setError(res.error); return; }
      setName(''); setLinkPattern('');
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
              <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.link_pattern || '—'}</span>
              <button type="button" onClick={() => handleDelete(s.id)} disabled={isPending} style={dangerBtn()}>מחיקה</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם המקור (למשל: עומרי)" style={{ ...inputStyle(), width: 160 }} />
          <input value={linkPattern} onChange={(e) => setLinkPattern(e.target.value)} placeholder="קישור/דפוס מזהה (אופציונלי)" style={{ ...inputStyle(), flex: 1, minWidth: 200 }} />
          <button type="button" onClick={handleAdd} disabled={isPending || !name.trim()} style={primaryBtnSmall()}>הוספה</button>
        </div>
        {error && <div style={{ color: '#b23b2f', fontSize: 11.5, marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}

function inputStyle() {
  return { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, boxSizing: 'border-box' };
}
function linkBtn() {
  return { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1f4d3d', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, textDecoration: 'none', cursor: 'pointer' };
}
function primaryBtnSmall() {
  return { background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' };
}
function dangerBtn() {
  return { background: 'none', border: '1px solid var(--border, #e5e5e5)', color: '#b23b2f', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer' };
}
