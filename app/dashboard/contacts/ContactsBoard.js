'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, Tag, initials } from '../components/ui';
import ContactQuickActions from '../components/ContactQuickActions';
import AdvancedFilterPanel from '../components/AdvancedFilterPanel';
import { contactMatchesAdvancedFilter } from '../components/advancedFilter';
import { addContactTag } from './actions';

const inputStyle = { border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

// רשימת אנשי קשר עם סינון/חיפוש/מיון בצד הלקוח - אותו דפוס בדיוק כמו
// בעמוד הלידים (LeadsBoard.js), כדי שיהיה נוח לאתר איש קשר ספציפי גם
// כשיש מאות רשומות, לא רק סינון לפי תגית כמו שהיה.
export default function ContactsBoard({ contacts, allTags, tagGroups = null, allDepartments, sendConnections, whatsappTemplates, emailTemplates, stageLabels = {}, stageColors = {}, extraFieldsByDept = {}, pipelinesByWorkspace = {} }) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [selected, setSelected] = useState(() => new Set());
  const [fieldFilters, setFieldFilters] = useState({});
  const [advancedFilters, setAdvancedFilters] = useState({});
  const router = useRouter();

  const activeExtraFields = deptFilter ? (extraFieldsByDept[deptFilter] || []) : [];

  function setFieldFilter(key, value) {
    setFieldFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let result = contacts;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) =>
        `${c.first} ${c.last}`.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.source || '').toLowerCase().includes(q)
      );
    }
    if (tagFilter) result = result.filter((c) => (c.tags || []).includes(tagFilter));
    if (deptFilter) result = result.filter((c) => c.departments.some((d) => d.name === deptFilter));

    const activeFieldFilterEntries = Object.entries(fieldFilters).filter(([, v]) => v);
    if (deptFilter && activeFieldFilterEntries.length > 0) {
      result = result.filter((c) => {
        const dept = c.departments.find((d) => d.name === deptFilter);
        if (!dept) return false;
        return activeFieldFilterEntries.every(([key, value]) => {
          const fieldDef = activeExtraFields.find((f) => f.key === key);
          const actual = dept.extraFields?.[key];
          if (fieldDef?.type === 'select') return actual === value;
          return (actual || '').toString().toLowerCase().includes(value.toLowerCase());
        });
      });
    }

    if (Object.keys(advancedFilters).length > 0) {
      result = result.filter((c) => contactMatchesAdvancedFilter(c, advancedFilters, extraFieldsByDept));
    }

    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name': return `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`, 'he');
        case 'created_asc': return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case 'created_desc':
        default: return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });
    return sorted;
  }, [contacts, search, tagFilter, deptFilter, sortBy, fieldFilters, activeExtraFields, advancedFilters, extraFieldsByDept]);

  const activeFilterCount = [tagFilter, deptFilter].filter(Boolean).length;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון, מייל, מקור..."
          style={{ ...inputStyle, flex: '1 1 240px', minWidth: 180 }}
        />
        <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setFieldFilters({}); }} style={inputStyle}>
          <option value="">כל המחלקות</option>
          {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={inputStyle}>
          <option value="">כל התגיות</option>
          {tagGroups ? tagGroups.map((g) => (
            <optgroup key={g.department || '__general__'} label={g.department || 'כלליות'}>
              {g.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          )) : allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, marginInlineStart: 'auto' }}>
          <option value="created_desc">מיון: נוספו לאחרונה</option>
          <option value="created_asc">מיון: הכי ותיקים</option>
          <option value="name">מיון: שם (א-ת)</option>
        </select>
        {(activeFilterCount > 0 || search) && (
          <button
            onClick={() => { setSearch(''); setTagFilter(''); setDeptFilter(''); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ניקוי סינון
          </button>
        )}
      </div>

      <AdvancedFilterPanel
        pipelinesByWorkspace={pipelinesByWorkspace}
        extraFieldsByWorkspace={extraFieldsByDept}
        value={advancedFilters}
        onChange={setAdvancedFilters}
      />

      {activeExtraFields.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>סינון לפי שדות {deptFilter}:</span>
          {activeExtraFields.map((f) => (
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

      {filtered.length !== contacts.length && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          מציג {filtered.length} מתוך {contacts.length} אנשי קשר
        </div>
      )}

      <BulkActionBar selected={selected} setSelected={setSelected} router={router} />

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                onChange={() => {
                  setSelected((prev) => {
                    const allSelected = filtered.length > 0 && filtered.every((c) => prev.has(c.id));
                    const next = new Set(prev);
                    if (allSelected) filtered.forEach((c) => next.delete(c.id));
                    else filtered.forEach((c) => next.add(c.id));
                    return next;
                  });
                }}
              />
            </th>
            {['שם', 'מחלקות', 'טלפון', 'מייל', 'תחום', 'מקור', 'תגיות', 'פעולות מהירות'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
              <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                  <span style={{
                    width: 28, height: 28, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0,
                  }}>
                    {initials(c.first, c.last)}
                  </span>
                  {c.first} {c.last}
                </Link>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.departments.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.name}</span>
                      <StageBadge stage={d.stage} labels={stageLabels} colors={stageColors} />
                    </div>
                  ))}
                  {c.departments.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                </div>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.dept || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.source || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                {(c.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
                {(!c.tags || c.tags.length === 0) && '—'}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <ContactQuickActions
                  contact={{ id: c.id, first: c.first, phone: c.phone, email: c.email, frozen: c.frozen }}
                  departments={c.departments.map((d) => ({ workspaceId: d.workspaceId, workspaceName: d.name }))}
                  sendConnections={sendConnections || []}
                  whatsappTemplates={whatsappTemplates || []}
                  emailTemplates={emailTemplates || []}
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={9} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>אין אנשי קשר התואמים את הסינון</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// סרגל פעולות קבוצתיות - כרגע רק הוספת תגית לכולם, כי אנשי קשר משותפים
// לכל המחלקות ואין "נציג מטפל" יחיד שרלוונטי לבחור עבורם כאן (בניגוד
// ללידים, ששייכים למחלקה אחת ברורה)
function BulkActionBar({ selected, setSelected, router }) {
  const [isPending, startTransition] = useTransition();
  const [tag, setTag] = useState('');

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

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16,
      background: '#eef2f7', border: '1px solid #c9d6e3', borderRadius: 8, padding: '10px 14px',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3b5878' }}>נבחרו {selected.size} אנשי קשר</span>

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
