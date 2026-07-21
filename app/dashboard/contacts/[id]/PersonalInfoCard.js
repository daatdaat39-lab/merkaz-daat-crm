'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Tag } from '../../components/ui';
import { updateContact, searchContacts, assignAgent } from '../actions';
import TagPicker from '../TagPicker';

const inputStyle = { width: '100%', border: '1px solid #e5e5e5', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 };
const categoryLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '14px 0 8px' };

// כרטיס "פרטים אישיים" - מחולק לקטגוריות (זהות, פרטי קשר, פעילות
// ומעקב), עם עריכה ישירה של השדות עצמם (לא טופס נפרד למטה). לחיצה על
// ✎ הופכת את שורות הזהות/פרטי הקשר לשדות קלט במקום, עם שמירה/ביטול.
export default function PersonalInfoCard({
  contact, existingTags, age, hebrewDate, nextMeeting, openTasksCount, agentId, agentName, agents, activeWorkspaceId,
  lastActivityAt, relatedContact,
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [related, setRelated] = useState(relatedContact ? { id: relatedContact.id, name: `${relatedContact.first} ${relatedContact.last}` } : null);
  const router = useRouter();

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
    <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase' }}>
          פרטים אישיים
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          disabled={contact.frozen}
          title="עריכת פרטים"
          style={{
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, width: 26, height: 26,
            cursor: contact.frozen ? 'default' : 'pointer', fontSize: 12.5, opacity: contact.frozen ? 0.5 : 1,
          }}
        >
          {editing ? '✕' : '✎'}
        </button>
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12, marginTop: 8 }}>שגיאה: {error}</div>}

      {editing ? (
        <form action={handleSubmit}>
          <Field label="שם פרטי" name="first" defaultValue={contact.first} />
          <Field label="שם משפחה" name="last" defaultValue={contact.last} />
          <Field label="ת.ז / מזהה" name="idnum" defaultValue={contact.idnum} />
          <Field label="תאריך לידה" name="birth_date" type="date" defaultValue={contact.birth_date} />
          <SelectField label="מגדר" name="gender" defaultValue={contact.gender} options={[{ value: '', label: '—' }, { value: 'זכר', label: 'זכר' }, { value: 'נקבה', label: 'נקבה' }]} />
          <Field label="מקור" name="source" defaultValue={contact.source} />

          <div style={categoryLabel}>פרטי קשר</div>
          <Field label="טלפון" name="phone" defaultValue={contact.phone} />
          <Field label="טלפון נוסף" name="phone2" defaultValue={contact.phone2} />
          <Field label="מייל" name="email" type="email" defaultValue={contact.email} />
          <Field label="מייל נוסף" name="email2" type="email" defaultValue={contact.email2} />

          <div style={categoryLabel}>קשרים</div>
          <RelatedContactPicker contactId={contact.id} related={related} setRelated={setRelated} />
          <Field label="סוג קרבה (למשל: אב, בן זוג)" name="relation_label" defaultValue={contact.relation_label} />

          <div style={categoryLabel}>תגיות</div>
          <TagPicker existingTags={existingTags} defaultTags={contact.tags || []} />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" disabled={isPending} style={{ flex: 1, background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>
              שמירה
            </button>
            <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}>
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
          <InfoRow label="מקור" value={contact.source} />
          <InfoRow label="נוצר בתאריך" value={new Date(contact.created_at).toLocaleDateString('he-IL')} />
          {relatedContact && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: '#9b9b9b' }}>{contact.relation_label || 'איש קשר קשור'}</div>
              <Link href={`/dashboard/contacts/${relatedContact.id}`} style={{ fontSize: 13, color: '#1f4d3d' }}>
                {relatedContact.first} {relatedContact.last} →
              </Link>
            </div>
          )}

          <div style={categoryLabel}>פרטי קשר</div>
          <InfoRow label="טלפון" value={contact.phone} />
          <InfoRow label="טלפון נוסף" value={contact.phone2} />
          <InfoRow label="מייל" value={contact.email} />
          <InfoRow label="מייל נוסף" value={contact.email2} />

          <div style={categoryLabel}>פעילות ומעקב</div>
          <InfoRow label="פעילות אחרונה" value={lastActivityAt ? new Date(lastActivityAt).toLocaleDateString('he-IL') : null} />
          <InfoRow
            label="פגישה קרובה"
            value={nextMeeting ? `${new Date(nextMeeting.meeting_date).toLocaleDateString('he-IL')} · ${nextMeeting.meeting_time?.slice(0, 5)}` : null}
          />
          {activeWorkspaceId ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: '#9b9b9b', marginBottom: 2 }}>נציג מטפל</div>
              <select value={agentId || ''} onChange={handleAgentChange} disabled={isPending} style={inputStyle}>
                <option value="">ללא נציג</option>
                {(agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <InfoRow label="נציג מטפל" value={agentName} />
          )}
          <InfoRow label="משימות פתוחות" value={openTasksCount > 0 ? openTasksCount : null} />

          <div style={{ marginTop: 12 }}>
            {(contact.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '—'}</div>
    </div>
  );
}

function Field({ label, name, type = 'text', defaultValue }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b', marginBottom: 2 }}>{label}</div>
      <input name={name} type={type} defaultValue={defaultValue || ''} style={inputStyle} />
    </div>
  );
}

function SelectField({ label, name, defaultValue, options }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b', marginBottom: 2 }}>{label}</div>
      <select name={name} defaultValue={defaultValue || ''} style={inputStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// חיפוש ובחירת איש קשר קשור (למשל קרבה משפחתית) - משתמש באותה פעולת
// חיפוש כמו מיזוג כפילויות
function RelatedContactPicker({ contactId, related, setRelated }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [, startTransition] = useTransition();

  function handleSearch(value) {
    setQuery(value);
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
        <button type="button" onClick={() => setRelated(null)} style={{ background: 'none', border: 'none', color: '#b23b2f', fontSize: 11, cursor: 'pointer' }}>
          הסרה
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <input
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="חיפוש איש קשר קשור..."
        style={inputStyle}
      />
      {results.length > 0 && (
        <div style={{ marginTop: 4, border: '1px solid #e5e5e5', borderRadius: 6, background: '#fff', maxHeight: 140, overflowY: 'auto' }}>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { setRelated({ id: r.id, name: `${r.first} ${r.last}` }); setQuery(''); setResults([]); }}
              style={{ display: 'block', width: '100%', textAlign: 'right', background: 'none', border: 'none', padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
            >
              {r.first} {r.last} <span style={{ color: '#9b9b9b' }}>{r.phone || r.email || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
