'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEPT_KEYWORDS, contactMatchesDept } from '../../components/ui';
import { addContactTag, assignAgent } from '../../contacts/actions';
import { updateCampaignContact } from '../campaigns/actions';
import LeadRow from './LeadRow';

const inputStyle = { border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

// לוח לידים עם סינון ומיון בצד הלקוח - הנתונים כבר נטענו מהשרת, אז
// כל הסינון/מיון כאן מיידי בלי בקשות נוספות. הקיבוץ לפי תגית (תרומות/
// לימודי/מנהלה) נשאר, אבל מחושב אחרי הסינון כדי שכל קבוצה תשקף אותו.
// לשוניות מחזור חיים - מחושבות מתוך מטא-דאטת ה-pipeline הדינמית שכבר
// קיימת (leadStages/wonStage/sideStages), בלי טבלה/עמודה חדשה. "בתהליך"
// היא ההבחנה היחידה שדורשת היוריסטיקה (יש נציג מוקצה = כבר בטיפול).
const TABS = [
  { key: 'new', label: 'פתוחים / חדשים' },
  { key: 'in_progress', label: 'בתהליך' },
  { key: 'won', label: 'הצליחו' },
  { key: 'closed', label: 'נפלו / סגורים' },
];

function tabOf(lead, leadStages, wonStage) {
  if (wonStage && lead.stage === wonStage) return 'won';
  if (leadStages.includes(lead.stage)) return lead.agent_id ? 'in_progress' : 'new';
  return 'closed';
}

export default function LeadsBoard({ leads, agents, workspaceId, workspaceName, stages, sideStages = [], stageLabels = {}, stageColors = {}, leadStages = [], wonStage = null, sendConnections = [], whatsappTemplates = [], emailTemplates = [], extraFields = [], closeReasons, campaignLeadGroups = [] }) {
  const [activeTab, setActiveTab] = useState('new');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [overdueHours, setOverdueHours] = useState(24);
  const [sortBy, setSortBy] = useState('activity_desc');
  const [selected, setSelected] = useState(() => new Set());
  const [fieldFilters, setFieldFilters] = useState({});

  function setFieldFilter(key, value) {
    setFieldFilters((prev) => ({ ...prev, [key]: value }));
  }
  const router = useRouter();

  const leadsWithTab = useMemo(() => leads.map((l) => ({ ...l, _tab: tabOf(l, leadStages, wonStage) })), [leads, leadStages, wonStage]);
  const tabCounts = useMemo(() => {
    const counts = { new: 0, in_progress: 0, won: 0, closed: 0 };
    for (const l of leadsWithTab) counts[l._tab] += 1;
    return counts;
  }, [leadsWithTab]);
  const tabLeads = useMemo(() => leadsWithTab.filter((l) => l._tab === activeTab), [leadsWithTab, activeTab]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const reasonOptions = useMemo(
    () => Array.from(new Set(tabLeads.map((l) => l.latestReason).filter(Boolean))).sort(),
    [tabLeads]
  );

  const filtered = useMemo(() => {
    let result = tabLeads;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) =>
        `${c.first} ${c.last}`.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.source || '').toLowerCase().includes(q) ||
        (c.latestReason || '').toLowerCase().includes(q)
      );
    }
    if (agentFilter === 'none') result = result.filter((c) => !c.agent_id);
    else if (agentFilter) result = result.filter((c) => c.agent_id === agentFilter);
    if (stageFilter) result = result.filter((c) => c.stage === stageFilter);
    if (reasonFilter) result = result.filter((c) => c.latestReason === reasonFilter);
    if (overdueOnly) {
      const threshold = Number(overdueHours) > 0 ? Number(overdueHours) : 24;
      result = result.filter((c) => c.last_activity_at && (Date.now() - new Date(c.last_activity_at).getTime()) / 3600000 >= threshold);
    }
    const activeFieldFilterEntries = Object.entries(fieldFilters).filter(([, v]) => v);
    if (activeFieldFilterEntries.length > 0) {
      result = result.filter((c) => activeFieldFilterEntries.every(([key, value]) => {
        const fieldDef = extraFields.find((f) => f.key === key);
        const actual = c.extra_fields?.[key];
        if (fieldDef?.type === 'select') return actual === value;
        return (actual || '').toString().toLowerCase().includes(value.toLowerCase());
      }));
    }

    const agentName = (id) => agents.find((a) => a.id === id)?.name || '';
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'activity_asc': return new Date(a.last_activity_at || 0) - new Date(b.last_activity_at || 0);
        case 'activity_desc': return new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0);
        case 'name': return `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`, 'he');
        case 'agent': return agentName(a.agent_id).localeCompare(agentName(b.agent_id), 'he');
        case 'reason': return (a.latestReason || '').localeCompare(b.latestReason || '', 'he');
        default: return 0;
      }
    });
    return sorted;
  }, [tabLeads, search, agentFilter, stageFilter, reasonFilter, overdueOnly, overdueHours, sortBy, agents, fieldFilters, extraFields]);

  const departments = Object.keys(DEPT_KEYWORDS);
  const categorized = departments
    .map((dept) => ({ dept, leads: filtered.filter((l) => contactMatchesDept(l, dept)) }))
    .filter((group) => group.leads.length > 0);
  const categorizedIds = new Set(categorized.flatMap((g) => g.leads.map((l) => l.id)));
  const uncategorized = filtered.filter((l) => !categorizedIds.has(l.id));

  const activeFilterCount = [agentFilter, stageFilter, reasonFilter, overdueOnly ? 'x' : ''].filter(Boolean).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: 'none', border: 'none', borderBottom: '2px solid ' + (activeTab === t.key ? '#0a0a0a' : 'transparent'),
              padding: '8px 4px', marginBottom: -1, fontSize: 13, fontWeight: activeTab === t.key ? 600 : 500,
              color: activeTab === t.key ? '#0a0a0a' : 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {t.label} ({tabCounts[t.key]})
          </button>
        ))}
      </div>

      {campaignLeadGroups.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>🎯 לידים מקמפיינים</div>
          {campaignLeadGroups.map((g) => (
            <CampaignLeadGroup key={g.campaignId} group={g} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון, מייל, מקור, מהות פנייה..."
          style={{ ...inputStyle, flex: '1 1 240px', minWidth: 180 }}
        />
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} style={inputStyle}>
          <option value="">כל הנציגים</option>
          <option value="none">ללא נציג</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={inputStyle}>
          <option value="">כל השלבים</option>
          {stages.map((s) => <option key={s} value={s}>{stageLabels[s] || s}</option>)}
        </select>
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} style={inputStyle}>
          <option value="">כל הנושאים</option>
          {reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          רק ליד שלא טופל מעל
          <input
            type="number"
            min={1}
            value={overdueHours}
            disabled={!overdueOnly}
            onChange={(e) => setOverdueHours(e.target.value)}
            style={{ ...inputStyle, width: 52, padding: '5px 6px', opacity: overdueOnly ? 1 : 0.5 }}
          />
          שעות
        </label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, marginInlineStart: 'auto' }}>
          <option value="activity_desc">מיון: טופל לאחרונה קודם</option>
          <option value="activity_asc">מיון: הכי ותיק קודם (איחור)</option>
          <option value="name">מיון: שם (א-ת)</option>
          <option value="agent">מיון: נציג מטפל</option>
          <option value="reason">מיון: מהות הפנייה</option>
        </select>
        {activeFilterCount > 0 && (
          <button
            onClick={() => { setAgentFilter(''); setStageFilter(''); setReasonFilter(''); setOverdueOnly(false); setOverdueHours(24); setSearch(''); setFieldFilters({}); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ניקוי סינון
          </button>
        )}
      </div>

      {extraFields.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>סינון לפי שדות {workspaceName}:</span>
          {extraFields.map((f) => (
            f.type === 'select' ? (
              <select key={f.key} value={fieldFilters[f.key] || ''} onChange={(e) => setFieldFilter(f.key, e.target.value)} style={inputStyle}>
                <option value="">{f.label}</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                key={f.key}
                value={fieldFilters[f.key] || ''}
                onChange={(e) => setFieldFilter(f.key, e.target.value)}
                placeholder={f.label}
                style={inputStyle}
              />
            )
          ))}
        </div>
      )}

      {filtered.length !== tabLeads.length && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          מציג {filtered.length} מתוך {tabLeads.length} לידים בלשונית זו
        </div>
      )}

      <BulkActionBar selected={selected} setSelected={setSelected} agents={agents} workspaceId={workspaceId} router={router} />

      {categorized.map((group) => (
        <LeadGroup key={group.dept} title={group.dept} leads={group.leads} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} stages={stages} sideStages={sideStages} stageLabels={stageLabels} stageColors={stageColors} sendConnections={sendConnections} whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates} selected={selected} onToggleSelect={toggleSelect} setSelected={setSelected} extraFields={extraFields} closeReasons={closeReasons} />
      ))}

      {uncategorized.length > 0 && <LeadGroup title="ללא תגית מזוהה" leads={uncategorized} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} stages={stages} sideStages={sideStages} stageLabels={stageLabels} stageColors={stageColors} sendConnections={sendConnections} whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates} selected={selected} onToggleSelect={toggleSelect} setSelected={setSelected} extraFields={extraFields} closeReasons={closeReasons} />}

      {filtered.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין לידים התואמים את הסינון</div>
      )}
    </div>
  );
}

// סרגל פעולות קבוצתיות - מופיע כשיש בחירה, עם הוספת תגית לכולם ושינוי
// נציג מטפל לכולם בבת אחת (שתי הפעולות שכבר קיימות כבודדות, כאן על כמה
// לידים יחד כדי לחסוך לחיצות כשמעבירים אחריות בין נציגים)
function BulkActionBar({ selected, setSelected, agents, workspaceId, router }) {
  const [isPending, startTransition] = useTransition();
  const [tag, setTag] = useState('');
  const [bulkAgent, setBulkAgent] = useState('');

  if (selected.size === 0) return null;

  function applyTag() {
    const t = tag.trim();
    if (!t) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      await Promise.all(ids.map((id) => addContactTag(id, t)));
      setTag('');
      setSelected(new Set());
      router.refresh();
    });
  }

  function applyAgent() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await Promise.all(ids.map((id) => assignAgent(id, workspaceId, bulkAgent || null)));
      setBulkAgent('');
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16,
      background: '#eef2f7', border: '1px solid #c9d6e3', borderRadius: 8, padding: '10px 14px',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3b5878' }}>נבחרו {selected.size} לידים</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="הוספת תגית לכולם..."
          style={{ ...inputStyle, fontSize: 12 }}
        />
        <button type="button" onClick={applyTag} disabled={isPending || !tag.trim()} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          הוספה
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
          <option value="">ללא נציג</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" onClick={applyAgent} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          שינוי נציג לכולם
        </button>
      </div>

      <button
        type="button"
        onClick={() => setSelected(new Set())}
        style={{ background: 'none', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878', marginInlineStart: 'auto' }}
      >
        ביטול בחירה
      </button>
    </div>
  );
}

function LeadGroup({ title, leads, agents, workspaceId, workspaceName, stages, sideStages = [], stageLabels = {}, stageColors = {}, sendConnections, whatsappTemplates, emailTemplates, selected, onToggleSelect, setSelected, extraFields = [], closeReasons }) {
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) leads.forEach((l) => next.delete(l.id));
      else leads.forEach((l) => next.add(l.id));
      return next;
    });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
        {title} ({leads.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            </th>
            {['שם', 'סטטוס', 'טלפון', 'מייל', 'מקור', 'מהות הפנייה', 'טיפול אחרון', 'נציג מטפל'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
            ))}
            {extraFields.map((f) => (
              <th key={f.key} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>{f.label}</th>
            ))}
            <th style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>פעולות מהירות</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((c) => (
            <LeadRow key={c.id} contact={c} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} stages={stages} sideStages={sideStages} stageLabels={stageLabels} stageColors={stageColors} sendConnections={sendConnections} whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates} selected={selected.has(c.id)} onToggleSelect={onToggleSelect} extraFields={extraFields} closeReasons={closeReasons} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// טבלה נפרדת לכל קמפיין פעיל - נציג רגיל רואה רק את מה שהוקצה לו
// (מסונן כבר בשרת), מנהל רואה את כל חברי הקמפיין
function CampaignLeadGroup({ group }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusChange(rowId, value) {
    startTransition(async () => {
      await updateCampaignContact(rowId, { status: value });
      router.refresh();
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
        {group.campaignName} ({group.rows.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['שם', 'סטטוס', 'טלפון', 'מייל'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => (
            <tr key={r.rowId} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>
                <a href={`/dashboard/contacts/${r.contactId}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>{r.name}</a>
              </td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>
                <select
                  value={r.status}
                  onChange={(e) => handleStatusChange(r.rowId, e.target.value)}
                  disabled={isPending}
                  style={{
                    border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    background: (group.stages.colors[r.status] || {}).bg || '#f4f4f5',
                    color: (group.stages.colors[r.status] || {}).color || '#52525b',
                  }}
                >
                  {group.stages.order.map((s) => <option key={s} value={s}>{group.stages.labels[s] || s}</option>)}
                </select>
              </td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>{r.phone || '—'}</td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>{r.email || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
