'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEPT_KEYWORDS, contactMatchesDept } from '../../components/ui';
import TagFilterMultiSelect from '../../components/TagFilterMultiSelect';
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
  { key: 'all', label: 'הכל' },
];

// שיוך שלב לטאב - אם המנהל קבע שיוך מפורש בהגדרות שלבי pipeline
// (lead_tab שונה מ-'auto'), הוא גובר לגמרי על ההיוריסטיקה; אחרת נופלים
// חזרה להיוריסטיקה הקיימת (שלב-ניצחון/leadStages/שיוך נציג).
function tabOf(lead, leadStages, wonStage, leadTabByStage) {
  const explicit = leadTabByStage?.[lead.stage];
  if (explicit && explicit !== 'auto') return explicit;
  if (wonStage && lead.stage === wonStage) return 'won';
  if (leadStages.includes(lead.stage)) return lead.agent_id ? 'in_progress' : 'new';
  return 'closed';
}

export default function LeadsBoard({ leads, agents, workspaceId, workspaceName, stages, sideStages = [], stageLabels = {}, stageColors = {}, leadStages = [], wonStage = null, leadTabByStage = {}, sendConnections = [], whatsappTemplates = [], emailTemplates = [], extraFields = [], closeReasons, campaignLeadGroups = [], allTags = [], tagGroups = null }) {
  const [activeTab, setActiveTab] = useState('new');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [tagFilters, setTagFilters] = useState([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [overdueHours, setOverdueHours] = useState(24);
  const [sortBy, setSortBy] = useState('activity_desc');
  const [selected, setSelected] = useState(() => new Set());
  const router = useRouter();

  const leadsWithTab = useMemo(() => leads.map((l) => ({ ...l, _tab: tabOf(l, leadStages, wonStage, leadTabByStage) })), [leads, leadStages, wonStage, leadTabByStage]);
  const tabCounts = useMemo(() => {
    const counts = { new: 0, in_progress: 0, won: 0, closed: 0, all: leadsWithTab.length };
    for (const l of leadsWithTab) counts[l._tab] += 1;
    return counts;
  }, [leadsWithTab]);
  const tabLeads = useMemo(
    () => (activeTab === 'all' ? leadsWithTab : leadsWithTab.filter((l) => l._tab === activeTab)),
    [leadsWithTab, activeTab]
  );

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

  // ערכי "שלב" בסרגל הסינון הראשי כוללים גם את שלבי הקמפיינים הפעילים
  // (בקידומת __campaign__:<campaignId>:<stageKey>, כדי לא להתנגש בערכי
  // stage_key של המחלקה) - כשנבחר ערך כזה, מסננים רק את שורות הקמפיין
  // הספציפי הזה, ולידים "רגילים" ממילא לא תואמים כי הערך לא שווה לאף
  // stage_key אמיתי. בונים מ-campaignLeadGroups המקורי (לא המסונן) כדי
  // שרשימת האפשרויות תישאר יציבה גם כשסינון אחר מצמצם תוצאות.
  const isCampaignStageFilter = stageFilter.startsWith('__campaign__:');

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
    if (tagFilters.length > 0) result = result.filter((c) => (c.tags || []).some((t) => tagFilters.includes(t)));
    if (overdueOnly) {
      const threshold = Number(overdueHours) > 0 ? Number(overdueHours) : 24;
      result = result.filter((c) => c.last_activity_at && (Date.now() - new Date(c.last_activity_at).getTime()) / 3600000 >= threshold);
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
  }, [tabLeads, search, agentFilter, stageFilter, reasonFilter, tagFilters, overdueOnly, overdueHours, sortBy, agents]);

  // אותו סרגל סינון (חיפוש/נציג/שלב) חל גם על שורות הקמפיינים למטה -
  // "מהות פנייה" ו"לא טופל מעל X שעות" לא רלוונטיים לשורת קמפיין (אין
  // לה latestReason/last_activity_at), ולכן סינון כזה מחריג אותן; שלב
  // "רגיל" של המחלקה גם מחריג אותן (אין להן stage כזה) - רק ערך שלב
  // עם קידומת __campaign__ שייך לקמפיין הזה בדיוק משאיר אותן.
  const campaignLeadGroupsFiltered = useMemo(() => {
    return campaignLeadGroups
      .map((g) => {
        let rows = g.rows;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          rows = rows.filter((r) => `${r.name} ${r.phone || ''} ${r.email || ''}`.toLowerCase().includes(q));
        }
        if (agentFilter === 'none') rows = rows.filter((r) => !r.assignedTo);
        else if (agentFilter) rows = rows.filter((r) => r.assignedTo === agentFilter);
        if (reasonFilter || overdueOnly) rows = [];
        if (stageFilter) {
          if (isCampaignStageFilter) {
            const [, campaignId, stageKey] = stageFilter.split(':');
            rows = g.campaignId === campaignId ? rows.filter((r) => r.status === stageKey) : [];
          } else {
            rows = [];
          }
        }
        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [campaignLeadGroups, search, agentFilter, reasonFilter, overdueOnly, stageFilter, isCampaignStageFilter]);

  const departments = Object.keys(DEPT_KEYWORDS);
  const categorized = departments
    .map((dept) => ({ dept, leads: filtered.filter((l) => contactMatchesDept(l, dept)) }))
    .filter((group) => group.leads.length > 0);
  const categorizedIds = new Set(categorized.flatMap((g) => g.leads.map((l) => l.id)));
  const uncategorized = filtered.filter((l) => !categorizedIds.has(l.id));

  const activeFilterCount = [agentFilter, stageFilter, reasonFilter, overdueOnly ? 'x' : '', tagFilters.length > 0 ? 'x' : ''].filter(Boolean).length;

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', paddingTop: 8, paddingBottom: 4, marginBottom: 14, boxShadow: '0 4px 10px -6px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 14 }}>
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
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={inputStyle} title="סינון זה חל גם על לידי המחלקה וגם על לידי הקמפיינים למטה">
          <option value="">כל השלבים</option>
          <optgroup label={`שלבי ${workspaceName}`}>
            {stages.map((s) => <option key={s} value={s}>{stageLabels[s] || s}</option>)}
          </optgroup>
          {campaignLeadGroups.map((g) => (
            <optgroup key={g.campaignId} label={`קמפיין: ${g.campaignName}`}>
              {g.stages.order.map((s) => (
                <option key={s} value={`__campaign__:${g.campaignId}:${s}`}>{g.stages.labels[s] || s}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} style={inputStyle}>
          <option value="">כל הנושאים</option>
          {reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <TagFilterMultiSelect value={tagFilters} onChange={setTagFilters} tags={allTags} groups={tagGroups} placeholder="כל התגיות" />
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
            onClick={() => { setAgentFilter(''); setStageFilter(''); setReasonFilter(''); setTagFilters([]); setOverdueOnly(false); setOverdueHours(24); setSearch(''); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ניקוי סינון
          </button>
        )}
      </div>
      </div>

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

      {campaignLeadGroupsFiltered.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>🎯 לידים מקמפיינים</div>
          {campaignLeadGroupsFiltered.map((g) => (
            <CampaignLeadGroup key={g.campaignId} group={g} />
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
  const [collapsed, setCollapsed] = useState(false);
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
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 10 }}>{collapsed ? '▸' : '▾'}</span>
        {title} ({leads.length})
      </button>
      {!collapsed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
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
      )}
    </div>
  );
}

// טבלה נפרדת לכל קמפיין פעיל - נציג רגיל רואה רק את מה שהוקצה לו
// (מסונן כבר בשרת), מנהל רואה את כל חברי הקמפיין
function CampaignLeadGroup({ group }) {
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  function handleStatusChange(rowId, value) {
    startTransition(async () => {
      await updateCampaignContact(rowId, { status: value });
      router.refresh();
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, marginBottom: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 10 }}>{collapsed ? '▸' : '▾'}</span>
        {group.campaignName} ({group.rows.length})
      </button>
      {!collapsed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
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
      )}
    </div>
  );
}
