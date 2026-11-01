'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, initials } from '../components/ui';
import ContactQuickActions from '../components/ContactQuickActions';
import AdvancedFilterPanel from '../components/AdvancedFilterPanel';
import { contactMatchesAdvancedFilter } from '../components/advancedFilter';
import { nameSimilarity } from '../lib/findDuplicates';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 100, padding: '7px 14px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' };

// רשימת אנשי קשר עם סינון/חיפוש/מיון בצד הלקוח - אותו דפוס בדיוק כמו
// בעמוד הלידים (LeadsBoard.js), כדי שיהיה נוח לאתר איש קשר ספציפי גם
// כשיש מאות רשומות, לא רק סינון לפי תגית כמו שהיה.
export default function ContactsBoard({ contacts, allDepartments, sendConnections, whatsappTemplates, emailTemplates, stageLabels = {}, stageColors = {}, extraFieldsByDept = {}, pipelinesByWorkspace = {} }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [fieldFilters, setFieldFilters] = useState({});
  const [advancedFilters, setAdvancedFilters] = useState({});
  const router = useRouter();

  // הרשימה מציגה DOM-row אמיתי לכל שורה (עם ContactQuickActions מקונן
  // בכל אחת) - עם 6,500+ אנשי קשר בלי הגבלה, זה מייצר עשרות-אלפי צמתי-DOM
  // בטעינה אחת, מה שהופך את כל המסך (וכל הקלדה בחיפוש) לאיטי. החיפוש/
  // הסינון/המיון עצמם ממשיכים לרוץ על כל הרשימה המלאה (בלי שינוי) - רק
  // מה שמוצג בפועל מוגבל ל-100 בכל פעם, עם "טען עוד" להמשיך.
  const PAGE_SIZE = 100;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  const activeExtraFields = deptFilter ? (extraFieldsByDept[deptFilter] || []) : [];

  function setFieldFilter(key, value) {
    setFieldFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    let result = contacts;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // חיפוש-גמיש: כל מילה-שהוקלדה חייבת-להופיע-איפשהו-בשם (בכל-סדר,
      // לא תת-מחרוזת-רציפה-אחת) - "ערד ישראל" ימצא גם "ישראל ערד". אם
      // אין-אף-תוצאה (לא-חיפוש-טלפון/מייל/מקור) - נופלים-חזרה על התאמה-
      // מקורבת (אותה nameSimilarity שכבר-בשימוש-בבדיקת-כפליות) לתפוס
      // טעויות-כתיב.
      const words = q.split(/\s+/).filter(Boolean);
      result = result.filter((c) => {
        const fullName = `${c.first} ${c.last}`.toLowerCase();
        return words.every((w) => fullName.includes(w)) ||
          (c.phone || '').includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.source || '').toLowerCase().includes(q);
      });
      if (result.length === 0) {
        result = contacts.filter((c) => nameSimilarity(`${c.first} ${c.last}`.toLowerCase(), q) >= 0.6);
      }
    }
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
  }, [contacts, search, deptFilter, fieldFilters, advancedFilters, sortBy, activeExtraFields, extraFieldsByDept]);

  // בכל שינוי סינון/חיפוש/מיון - חוזרים לעמוד הראשון של התצוגה, אחרת
  // "טען עוד" שכבר נלחץ קודם היה משאיר displayLimit גבוה על תוצאה חדשה.
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [search, deptFilter, fieldFilters, advancedFilters, sortBy]);

  const visible = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);

  const activeFilterCount = [deptFilter].filter(Boolean).length;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
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
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, marginInlineStart: 'auto' }}>
          <option value="created_desc">מיון: נוספו לאחרונה</option>
          <option value="created_asc">מיון: הכי ותיקים</option>
          <option value="name">מיון: שם (א-ת)</option>
        </select>
        {(activeFilterCount > 0 || search) && (
          <button
            onClick={() => { setSearch(''); setDeptFilter(''); }}
            style={{ ...inputStyle, cursor: 'pointer', color: 'var(--k-text-muted)' }}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, background: 'var(--k-pill-bg)', border: '1px solid var(--k-border)', borderRadius: 'var(--radius-lg)', padding: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>סינון לפי שדות {deptFilter}:</span>
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

      <div style={{ fontSize: 12, color: 'var(--k-text-muted)', marginBottom: 12 }}>
        {filtered.length !== contacts.length
          ? <>מציג {visible.length} מתוך {filtered.length} תוצאות (מסונן מתוך {contacts.length} אנשי קשר)</>
          : <>מציג {visible.length} מתוך {contacts.length} אנשי קשר</>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--k-bg)' }}>
            {['שם', 'מחלקות', 'טלפון', 'מייל', 'מקור', 'פעולות מהירות'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--k-text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--k-border)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit' }}>
                  <span style={{
                    width: 28, height: 28, background: 'var(--k-pill-bg)', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--k-pill-text)', flexShrink: 0,
                  }}>
                    {initials(c.first, c.last)}
                  </span>
                  <span style={{ fontFamily: 'var(--k-font-display)', fontSize: 15, color: 'var(--k-text)' }}>{c.first} {c.last}</span>
                </Link>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.departments.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--k-text-muted)' }}>{d.name}</span>
                      {/* אין תהליך פתוח (ייבוא היסטורי - opened_process=false) - לא
                          מוצג שום תג-שלב, רק שם-המחלקה למעלה. הצגת שלב (גם באפור)
                          הייתה נקראת כהחלטה-עסקית-אמיתית ("לא רלוונטי") במקום
                          שיוך-מידע-פסיבי. הפירוט המלא נשאר בכרטיס איש-הקשר עצמו. */}
                      {d.openedProcess && <StageBadge stage={d.stage} labels={stageLabels} colors={stageColors} />}
                    </div>
                  ))}
                  {c.departments.length === 0 && <span style={{ fontSize: 11, color: 'var(--k-text-muted)' }}>—</span>}
                </div>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--k-text)' }}>{c.phone || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--k-text)' }}>{c.email || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--k-text)' }}>{c.source || '—'}</td>
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
            <tr><td colSpan={9} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--k-text-muted)' }}>אין אנשי קשר התואמים את הסינון</td></tr>
          )}
        </tbody>
      </table>

      {visible.length < filtered.length && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setDisplayLimit((n) => n + PAGE_SIZE)}
            style={{ border: '1px solid var(--k-border)', borderRadius: 100, padding: '8px 20px', fontSize: 13, background: 'var(--k-surface)', color: 'var(--k-text)', cursor: 'pointer' }}
          >
            טען עוד ({filtered.length - visible.length} נוספים)
          </button>
        </div>
      )}
    </div>
  );
}
