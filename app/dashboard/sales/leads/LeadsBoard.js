'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEPT_KEYWORDS, contactMatchesDept } from '../../components/ui';
import TagFilterMultiSelect from '../../components/TagFilterMultiSelect';
import { addContactTag, assignAgentForLead } from '../../contacts/actions';
import { refreshStaleActionChips } from './aiChipActions';
import LeadTableRow from './LeadTableRow';
import { RefreshIcon } from '../../components/icons';

// עיצוב-pill רך לסרגל-הסינון (שלב 1 מתוכנית-העיצוב-מחדש) - תמיד גלוי
// (סוכם מפורשות שלא מאחורי כפתור), בכיוון "קינטי/מרווה" (ר' plan).
const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' };

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

export default function LeadsBoard({ leads, agents, workspaceId, workspaceName, stages, sideStages = [], stageLabels = {}, stageColors = {}, leadStages = [], wonStage = null, leadTabByStage = {}, sendConnections = [], whatsappTemplates = [], emailTemplates = [], extraFields = [], closeReasons, allTags = [], tagGroups = null }) {
  const [activeTab, setActiveTab] = useState('new');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [tagFilters, setTagFilters] = useState([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [overdueHours, setOverdueHours] = useState(24);
  const [sortBy, setSortBy] = useState('activity_desc');
  // selected: Map<departmentRowId, contactId> - לא Set פשוט, כי שתי
  // הפעולות-הקבוציות-למטה צריכות-מזהים-שונים: שינוי-נציג פועל-על-שורת-
  // הליד-הספציפית (ר' assignAgentForLead), הוספת-תגית פועלת-על-איש-
  // הקשר (תגית שייכת-לאיש-הקשר, לא לליד). איש-קשר עם-כמה-ליד-קורסים
  // פתוחים (course_id, migration 0164) יכול-להיות-נבחר-כמה-פעמים-בנפרד.
  const [selected, setSelected] = useState(() => new Map());
  const [refreshing, startRefresh] = useTransition();
  const [refreshMsg, setRefreshMsg] = useState('');
  const router = useRouter();

  const staleAiCount = useMemo(() => leads.filter((l) => l.aiActionSummaryStale).length, [leads]);

  // כפתור-רענון-ידני - לא קורא ל-AI על כל כרטיס בכל טעינה (יקר/איטי),
  // רק כשלוחצים, ואז באצווה-מוגבלת (ר' aiChipActions.js).
  function handleRefreshAi() {
    setRefreshMsg('');
    startRefresh(async () => {
      const res = await refreshStaleActionChips(workspaceId);
      if (res?.error) { setRefreshMsg(res.error); return; }
      setRefreshMsg(`עודכנו ${res.refreshed} המלצות`);
      router.refresh();
    });
  }

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

  function toggleSelect(id, contactId) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id); else next.set(id, contactId);
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

  const departments = Object.keys(DEPT_KEYWORDS);
  const categorized = departments
    .map((dept) => ({ dept, leads: filtered.filter((l) => contactMatchesDept(l, dept)) }))
    .filter((group) => group.leads.length > 0);
  const categorizedIds = new Set(categorized.flatMap((g) => g.leads.map((l) => l.id)));
  const uncategorized = filtered.filter((l) => !categorizedIds.has(l.id));

  const activeFilterCount = [agentFilter, stageFilter, reasonFilter, overdueOnly ? 'x' : '', tagFilters.length > 0 ? 'x' : ''].filter(Boolean).length;

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--k-bg)', paddingTop: 8, paddingBottom: 4, marginBottom: 14, boxShadow: '0 4px 10px -6px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 14 }}>
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
        <TagFilterMultiSelect value={tagFilters} onChange={setTagFilters} tags={allTags} groups={tagGroups} placeholder="כל התגיות" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--k-text-muted)', whiteSpace: 'nowrap' }}>
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
            style={{ ...inputStyle, cursor: 'pointer', color: 'var(--k-text-muted)' }}
          >
            ניקוי סינון
          </button>
        )}
      </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              fontFamily: 'var(--k-font-display)',
              background: activeTab === t.key ? 'var(--k-text)' : 'none',
              border: '1px solid ' + (activeTab === t.key ? 'var(--k-text)' : 'var(--k-border)'),
              borderRadius: 8, padding: '6px 16px', fontSize: 13,
              color: activeTab === t.key ? 'var(--k-bg)' : 'var(--k-text-muted)', cursor: 'pointer',
            }}
          >
            {t.label} ({tabCounts[t.key]})
          </button>
        ))}
        <button
          type="button" onClick={handleRefreshAi} disabled={refreshing || staleAiCount === 0}
          style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: staleAiCount === 0 ? 'default' : 'pointer', marginInlineStart: 'auto', opacity: staleAiCount === 0 ? 0.5 : 1 }}
        >
          <RefreshIcon size={13} /> {refreshing ? 'מרענן...' : `רענון המלצות AI${staleAiCount > 0 ? ` (${Math.min(staleAiCount, 25)})` : ''}`}
        </button>
        {refreshMsg && <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>{refreshMsg}</span>}
      </div>

      {filtered.length !== tabLeads.length && (
        <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginBottom: 12 }}>
          מציג {filtered.length} מתוך {tabLeads.length} לידים בלשונית זו
        </div>
      )}

      <BulkActionBar selected={selected} setSelected={setSelected} agents={agents} workspaceId={workspaceId} router={router} />

      {categorized.map((group) => (
        <LeadGroup key={group.dept} title={group.dept} leads={group.leads} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} stages={stages} sideStages={sideStages} stageLabels={stageLabels} stageColors={stageColors} leadStages={leadStages} sendConnections={sendConnections} whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates} selected={selected} onToggleSelect={toggleSelect} setSelected={setSelected} extraFields={extraFields} closeReasons={closeReasons} />
      ))}

      {uncategorized.length > 0 && <LeadGroup title="ללא תגית מזוהה" leads={uncategorized} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} stages={stages} sideStages={sideStages} stageLabels={stageLabels} stageColors={stageColors} leadStages={leadStages} sendConnections={sendConnections} whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates} selected={selected} onToggleSelect={toggleSelect} setSelected={setSelected} extraFields={extraFields} closeReasons={closeReasons} />}

      {filtered.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>אין לידים התואמים את הסינון</div>
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
    const contactIds = Array.from(new Set(selected.values()));
    startTransition(async () => {
      await Promise.all(contactIds.map((contactId) => addContactTag(contactId, t)));
      setTag('');
      setSelected(new Map());
      router.refresh();
    });
  }

  function applyAgent() {
    const departmentRowIds = Array.from(selected.keys());
    startTransition(async () => {
      await Promise.all(departmentRowIds.map((id) => assignAgentForLead(id, bulkAgent || null)));
      setBulkAgent('');
      setSelected(new Map());
      router.refresh();
    });
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16,
      background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', borderRadius: 12, padding: '10px 14px',
    }}>
      <span style={{ fontFamily: 'var(--k-font-display)', fontSize: 13, color: 'var(--k-text)' }}>נבחרו {selected.size} לידים</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="הוספת תגית לכולם..."
          style={{ ...inputStyle, fontSize: 12 }}
        />
        <button type="button" onClick={applyTag} disabled={isPending || !tag.trim()} style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          הוספה
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
          <option value="">ללא נציג</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" onClick={applyAgent} disabled={isPending} style={{ background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          שינוי נציג לכולם
        </button>
      </div>

      <button
        type="button"
        onClick={() => setSelected(new Map())}
        style={{ background: 'none', border: '1px solid var(--k-border)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--k-text-muted)', marginInlineStart: 'auto' }}
      >
        ביטול בחירה
      </button>
    </div>
  );
}

function LeadGroup({ title, leads, agents, workspaceId, workspaceName, stages, sideStages = [], stageLabels = {}, stageColors = {}, leadStages = [], sendConnections, whatsappTemplates, emailTemplates, selected, onToggleSelect, setSelected, extraFields = [], closeReasons }) {
  const [collapsed, setCollapsed] = useState(false);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) leads.forEach((l) => next.delete(l.id));
      else leads.forEach((l) => next.set(l.id, l.contactId));
      return next;
    });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, fontFamily: 'var(--k-font-display)', fontSize: 15, color: 'var(--k-text)', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 10 }}>{collapsed ? '▸' : '▾'}</span>
          {title} ({leads.length})
        </button>
        {!collapsed && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--k-text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            בחר הכל
          </label>
        )}
      </div>
      {!collapsed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'var(--k-bg)' }}>
              <th style={{ padding: '10px 8px' }}></th>
              {['שם', 'שלב', 'זמן', 'נציג מטפל'].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((c) => (
              <LeadTableRow key={c.id} contact={c} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName} stages={stages} sideStages={sideStages} stageLabels={stageLabels} stageColors={stageColors} leadStages={leadStages} sendConnections={sendConnections} whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates} selected={selected.has(c.id)} onToggleSelect={onToggleSelect} extraFields={extraFields} closeReasons={closeReasons} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

