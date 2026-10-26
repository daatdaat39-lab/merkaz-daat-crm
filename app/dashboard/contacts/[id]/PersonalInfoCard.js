'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Tag } from '../../components/ui';
import { updateContact, searchContacts, assignAgent, addContactTag } from '../actions';
import TagPicker from '../TagPicker';
import SourceMultiPicker from '../SourceMultiPicker';
import FamilyRelationsPanel from './FamilyRelationsPanel';

const inputStyle = { width: '100%', border: '1px solid var(--k-border)', borderRadius: 8, padding: '5px 8px', fontSize: 12.5, background: 'var(--k-surface)', color: 'var(--k-text)' };
const categoryLabel = { fontSize: 10, fontWeight: 700, color: 'var(--k-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '14px 0 8px' };

// כרטיס "פרטים אישיים" - מחולק לקטגוריות (זהות, פרטי קשר, פעילות
// ומעקב), עם עריכה ישירה של השדות עצמם (לא טופס נפרד למטה). לחיצה על
// ✎ הופכת את שורות הזהות/פרטי הקשר לשדות קלט במקום, עם שמירה/ביטול.
export default function PersonalInfoCard({
  contact, existingTags, tagGroups = null, existingSources = [], age, hebrewDate, nextMeeting, agentId, agentName, agents, activeWorkspaceId,
  lastActivityAt, relatedContact, relatedContacts = { forward: [], reverse: [] }, externalIds = [],
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [related, setRelated] = useState(relatedContact ? { id: relatedContact.id, name: `${relatedContact.first} ${relatedContact.last}` } : null);
  const router = useRouter();

  // שדות-ריקים לא מוצגים יותר כשורת-מקף (ר' InfoRow) - צ'יפ-מרוכז-אחד
  // פותח את טופס-העריכה-המלא הקיים (לא בונה עוד מנגנון-מילוי-בנפרד).
  const missingFieldsCount = [
    contact.idnum, contact.birth_date, contact.gender, contact.children_count, contact.source,
    contact.phone, contact.phone2, contact.email, contact.email2,
  ].filter((v) => v === null || v === undefined || v === '').length;

  function handleAgentChange(e) {
    if (!activeWorkspaceId) return;
    startTransition(async () => {
      await assignAgent(contact.id, activeWorkspaceId, e.target.value || null);
      router.refresh();
    });
  }

  function handleSubmit(formData) {
    setError(null);
    formData.set('related_contact_id', related?.id || '');
    startTransition(async () => {
      const res = await updateContact(contact.id, formData);
      if (res?.error) { setError(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-text-muted)', textTransform: 'uppercase' }}>
            פרטים אישיים
          </div>
          {contact.contact_number != null && (
            <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 2 }} title="מספר מזהה יחודי של איש הקשר במערכת">
              מס' לקוח: #{contact.contact_number}
            </div>
          )}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          disabled={contact.frozen}
          title="עריכת פרטים"
          style={{
            background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 6, width: 26, height: 26,
            cursor: contact.frozen ? 'default' : 'pointer', fontSize: 12.5, opacity: contact.frozen ? 0.5 : 1,
          }}
        >
          {editing ? '✕' : '✎'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--k-danger-text)', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}

      {editing ? (
        <form action={handleSubmit}>
          <Field label="שם פרטי" name="first" defaultValue={contact.first} />
          <Field label="שם משפחה" name="last" defaultValue={contact.last} />
          <Field label="ת.ז / מזהה" name="idnum" defaultValue={contact.idnum} />
          <Field label="תאריך לידה" name="birth_date" type="date" defaultValue={contact.birth_date} />
          <SelectField label="מגדר" name="gender" defaultValue={contact.gender} options={[{ value: '', label: '—' }, { value: 'זכר', label: 'זכר' }, { value: 'נקבה', label: 'נקבה' }]} />
          <Field label="מספר ילדים" name="children_count" type="number" defaultValue={contact.children_count} />
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginBottom: 2 }}>מקור</div>
            <SourceMultiPicker existingSources={existingSources} defaultValue={contact.source} />
          </div>

          <div style={categoryLabel}>פרטי קשר</div>
          <Field label="טלפון" name="phone" defaultValue={contact.phone} />
          <Field label="טלפון נוסף" name="phone2" defaultValue={contact.phone2} />
          <Field label="מייל" name="email" type="email" defaultValue={contact.email} />
          <Field label="מייל נוסף" name="email2" type="email" defaultValue={contact.email2} />

          <div style={categoryLabel}>כתובת</div>
          <Field label="עיר" name="city" defaultValue={contact.city} />
          <Field label="רחוב" name="street" defaultValue={contact.street} />
          <Field label="מספר בית" name="house_number" defaultValue={contact.house_number} />
          <Field label="דירה" name="apartment" defaultValue={contact.apartment} />
          <Field label="מיקוד" name="zip_code" defaultValue={contact.zip_code} />
          <Field label="שכונה" name="neighborhood" defaultValue={contact.neighborhood} />
          <Field label="מדינה" name="country" defaultValue={contact.country} />

          <div style={categoryLabel}>קשרים</div>
          <RelatedContactPicker contactId={contact.id} related={related} setRelated={setRelated} />
          <Field label="סוג קרבה (למשל: אב, בן זוג)" name="relation_label" defaultValue={contact.relation_label} />

          <div style={categoryLabel}>תגיות</div>
          <TagPicker existingTags={existingTags} defaultTags={contact.tags || []} groups={tagGroups} />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" disabled={isPending} style={{ flex: 1, background: 'var(--k-accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>
              שמירה
            </button>
            <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 100, padding: '7px 0', fontSize: 12.5, cursor: 'pointer', color: 'var(--k-text)' }}>
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <>
          <InfoRow label="ת.ז / מזהה" value={contact.idnum} />
          <InfoRow label="תאריך לידה" value={contact.birth_date ? new Date(contact.birth_date).toLocaleDateString('he-IL') : null} />
          <InfoRow label="גיל" value={age} />
          <InfoRow label="תאריך עברי" value={hebrewDate} />
          <InfoRow label="מגדר" value={contact.gender} />
          <InfoRow label="מספר ילדים" value={contact.children_count} />
          <InfoRow label="מקור" value={contact.source} />
          <InfoRow label="נוצר בתאריך" value={new Date(contact.created_at).toLocaleDateString('he-IL')} />
          {!contact.frozen && missingFieldsCount > 0 && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--k-pill-bg)', border: '1px dashed var(--k-border)',
                borderRadius: 100, padding: '4px 10px', fontSize: 11.5, color: 'var(--k-text-muted)', cursor: 'pointer', marginBottom: 8,
              }}
            >
              + השלמת {missingFieldsCount} פרטים חסרים
            </button>
          )}
          {externalIds.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)' }}>מזהים במערכות חיצוניות</div>
              <div style={{ fontSize: 13 }}>
                {externalIds.map((e) => `${e.source_system}: ${e.external_id}`).join(' · ')}
              </div>
            </div>
          )}
          <FamilyRelationsPanel contactId={contact.id} relatedContacts={relatedContacts} frozen={contact.frozen} />
          {relatedContact && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)' }}>{contact.relation_label || 'איש קשר קשור'}</div>
              <Link href={`/dashboard/contacts/${relatedContact.id}`} style={{ fontSize: 13, color: 'var(--k-accent)' }}>
                {relatedContact.first} {relatedContact.last} →
              </Link>
              {relatedContact.donationsCount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 2 }}>
                  🔗 {relatedContact.donationsCount} תרומות · ₪{relatedContact.donationsTotal.toLocaleString('he-IL')} אצל {relatedContact.first}
                </div>
              )}
            </div>
          )}

          {(contact.phone || contact.phone2 || contact.email || contact.email2) && (
            <>
              <div style={categoryLabel}>פרטי קשר</div>
              <InfoRow label="טלפון" value={contact.phone} />
              <InfoRow label="טלפון נוסף" value={contact.phone2} />
              <InfoRow label="מייל" value={contact.email} />
              <InfoRow label="מייל נוסף" value={contact.email2} />
            </>
          )}

          {(contact.city || contact.street || contact.zip_code || contact.neighborhood || contact.country) && (
            <>
              <div style={categoryLabel}>כתובת</div>
              <InfoRow label="עיר" value={contact.city} />
              <InfoRow label="רחוב" value={[contact.street, contact.house_number, contact.apartment ? `דירה ${contact.apartment}` : null].filter(Boolean).join(' ') || null} />
              <InfoRow label="שכונה" value={contact.neighborhood} />
              <InfoRow label="מיקוד" value={contact.zip_code} />
              <InfoRow label="מדינה" value={contact.country} />
            </>
          )}

          <div style={categoryLabel}>פעילות ומעקב</div>
          <InfoRow label="פעילות אחרונה" value={lastActivityAt ? new Date(lastActivityAt).toLocaleDateString('he-IL') : null} />
          <InfoRow
            label="פגישה קרובה"
            value={nextMeeting ? `${new Date(nextMeeting.meeting_date).toLocaleDateString('he-IL')} · ${nextMeeting.meeting_time?.slice(0, 5)}` : null}
          />
          {activeWorkspaceId ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginBottom: 2 }}>נציג מטפל</div>
              <select value={agentId || ''} onChange={handleAgentChange} disabled={isPending} style={inputStyle}>
                <option value="">ללא נציג</option>
                {(agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <InfoRow label="נציג מטפל" value={agentName} />
          )}
          {/* הוסר - כפול עם קוביית "משימות פתוחות" שכבר מוצגת למעלה
              (ContactDetailClient.js), שם כבר מותנית-ב->0 בדיוק כמו כאן. */}

          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {(contact.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
            {!contact.frozen && <QuickTagAdd contactId={contact.id} existingTags={existingTags} groups={tagGroups} currentTags={contact.tags || []} onAdded={() => router.refresh()} />}
          </div>
        </>
      )}
    </div>
  );
}

// שדה-ריק לא מוצג בכלל (לא עוד שורת "—") - ר' missingFieldsCount למעלה
// לצ'יפ-המרוכז-היחיד שפותח עריכה-מלאה במקום.
function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function Field({ label, name, type = 'text', defaultValue }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginBottom: 2 }}>{label}</div>
      <input name={name} type={type} defaultValue={defaultValue || ''} style={inputStyle} />
    </div>
  );
}

function SelectField({ label, name, defaultValue, options }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: 'var(--k-text-muted)', marginBottom: 2 }}>{label}</div>
      <select name={name} defaultValue={defaultValue || ''} style={inputStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// הוספת תגית מהירה מחוץ למצב עריכה - כפתור קטן שפותח חיפוש/בחירה מתוך
// תגיות קיימות (או הוספת תגית חדשה), בלי להיכנס לטופס העריכה המלא
function QuickTagAdd({ contactId, existingTags, groups = null, currentTags, onAdded }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const flatExisting = groups ? groups.flatMap((g) => g.tags) : existingTags;
  const suggestions = flatExisting
    .filter((t) => !currentTags.includes(t))
    .filter((t) => !query.trim() || t.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);
  const groupedSuggestions = groups
    ? groups
        .map((g) => ({
          department: g.department,
          tags: g.tags.filter((t) => !currentTags.includes(t)).filter((t) => !query.trim() || t.toLowerCase().includes(query.trim().toLowerCase())),
        }))
        .filter((g) => g.tags.length > 0)
    : null;
  const exactMatch = flatExisting.some((t) => t.toLowerCase() === query.trim().toLowerCase());

  function handleAdd(tag) {
    const t = tag.trim();
    if (!t) return;
    startTransition(async () => {
      await addContactTag(contactId, t);
      setQuery('');
      setOpen(false);
      onAdded?.();
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) handleAdd(query);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: 'var(--k-surface)', border: '1px dashed var(--k-border)', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: 'var(--k-text-muted)', cursor: 'pointer' }}
      >
        + תגית
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        placeholder="חיפוש/הוספת תגית..."
        style={{ ...inputStyle, width: 160, padding: '4px 8px', fontSize: 12 }}
      />
      <div style={{
        position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 4, minWidth: 160,
        border: '1px solid var(--k-border)', borderRadius: 8, background: 'var(--k-surface)', maxHeight: 200, overflowY: 'auto',
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 60,
      }}>
        {groupedSuggestions ? groupedSuggestions.map((g) => (
          <div key={g.department || '__general__'}>
            <div style={{ padding: '5px 10px 3px', fontSize: 9.5, fontWeight: 600, color: 'var(--k-text-muted)', textTransform: 'uppercase' }}>
              {g.department || 'כלליות'}
            </div>
            {g.tags.map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleAdd(t); }}
                style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid var(--k-border)', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
              >
                {t}
              </button>
            ))}
          </div>
        )) : suggestions.map((t) => (
          <button
            key={t}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleAdd(t); }}
            style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid var(--k-border)', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            {t}
          </button>
        ))}
        {query.trim() && !exactMatch && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleAdd(query); }}
            style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--k-accent)', fontWeight: 600 }}
          >
            + הוספת תגית חדשה: "{query.trim()}"
          </button>
        )}
        {suggestions.length === 0 && !query.trim() && (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--k-text-muted)' }}>הקלידו לחיפוש או הוספה</div>
        )}
      </div>
    </div>
  );
}

// חיפוש ובחירת איש קשר קשור (למשל קרבה משפחתית) - משתמש באותה פעולת
// חיפוש כמו מיזוג כפילויות
function RelatedContactPicker({ contactId, related, setRelated }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleSearch(value) {
    setQuery(value);
    setDropdownOpen(true);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchContacts(value, contactId);
      setResults(res);
    });
  }

  if (related) {
    return (
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
        <span>{related.name}</span>
        <button type="button" onClick={() => setRelated(null)} style={{ background: 'none', border: 'none', color: 'var(--k-danger-text)', fontSize: 11, cursor: 'pointer' }}>
          הסרה
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8, position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
        placeholder="חיפוש איש קשר קשור..."
        style={inputStyle}
      />
      {dropdownOpen && query.trim().length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, marginTop: 4,
          border: '1px solid var(--k-border)', borderRadius: 8, background: 'var(--k-surface)', maxHeight: 160, overflowY: 'auto',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 60,
        }}>
          {results.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--k-text-muted)' }}>אין תוצאות</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setRelated({ id: r.id, name: `${r.first} ${r.last}` }); setQuery(''); setResults([]); setDropdownOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', borderBottom: '1px solid var(--k-border)', padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
            >
              {r.first} {r.last} <span style={{ color: 'var(--k-text-muted)' }}>{r.phone || r.email || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
