'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { StageBadge, Tag, initials } from '../components/ui';
import ContactQuickActions from '../components/ContactQuickActions';

const inputStyle = { border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

// רשימת אנשי קשר עם סינון/חיפוש/מיון בצד הלקוח - אותו דפוס בדיוק כמו
// בעמוד הלידים (LeadsBoard.js), כדי שיהיה נוח לאתר איש קשר ספציפי גם
// כשיש מאות רשומות, לא רק סינון לפי תגית כמו שהיה.
export default function ContactsBoard({ contacts, allTags, allDepartments, sendConnections, whatsappTemplates, emailTemplates }) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');

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

    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name': return `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`, 'he');
        case 'created_asc': return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case 'created_desc':
        default: return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });
    return sorted;
  }, [contacts, search, tagFilter, deptFilter, sortBy]);

  const activeFilterCount = [tagFilter, deptFilter].filter(Boolean).length;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון, מייל, מקור..."
          style={{ ...inputStyle, flex: '1 1 240px', minWidth: 180 }}
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={inputStyle}>
          <option value="">כל המחלקות</option>
          {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={inputStyle}>
          <option value="">כל התגיות</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
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

      {filtered.length !== contacts.length && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          מציג {filtered.length} מתוך {contacts.length} אנשי קשר
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
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
                      <StageBadge stage={d.stage} />
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
            <tr><td colSpan={8} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>אין אנשי קשר התואמים את הסינון</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
