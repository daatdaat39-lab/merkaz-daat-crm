'use client';

import { useState, useTransition } from 'react';
import { formatIsraeliDateTime } from '../../../../lib/dateFormat';
import { EDITABLE_CONTACT_FIELDS } from '../../../../lib/editableContactFields';
import { submitContactEditSuggestion } from '../../../../lib/contactEditSuggestions';

const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '18px 0 8px' };
const card = { background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 };
const fieldRow = { display: 'flex', gap: 6, fontSize: 12.5 };
const fieldLabel = { color: 'var(--text-secondary)', flexShrink: 0 };
const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '5px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box' };

const ATTEMPT_ORDINALS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'];
function ordinal(n) {
  return ATTEMPT_ORDINALS[n - 1] || `#${n}`;
}

function formatAddress(p) {
  const parts = [p.street, p.house_number, p.apartment ? `דירה ${p.apartment}` : null, p.city, p.zip_code].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// טופס-הצעת-תיקון - state מקומי בלבד, שום דבר לא נשמר עד לחיצה על "שלח
// הצעה", ואז זה רק יוצר שורת-הצעה (contact_edit_suggestions) שממתינה
// לאישור מנהל - אף פעם לא כותב ישירות לאיש-הקשר. מסגרת-ענבר ברורה כדי
// שלא יתבלבל עם "פרטים אישיים" הרגיל (תצוגה בלבד) ממש מעליו.
function EditSuggestionForm({ contact, onDone }) {
  const initial = {
    first: contact.first || '', last: contact.last || '', phone: contact.phone || '', email: contact.email || '',
    ...Object.fromEntries(EDITABLE_CONTACT_FIELDS.map((f) => [f.key, contact.personalInfo?.[f.key] ?? ''])),
  };
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError('');
    const changes = {};
    for (const key of Object.keys(values)) {
      if (String(values[key] ?? '').trim() !== String(initial[key] ?? '').trim()) changes[key] = values[key];
    }
    if (Object.keys(changes).length === 0) { setError('לא שיניתם שום שדה'); return; }
    startTransition(async () => {
      const res = await submitContactEditSuggestion(contact.contactId, changes, contact.rowId);
      if (res.error) { setError(res.error); return; }
      setStatus('sent');
    });
  }

  if (status === 'sent') {
    return (
      <div style={{ background: '#fbf1de', border: '1px solid #e6c98a', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#a85c00' }}>
        ✓ ההצעה נשלחה למנהל לאישור.
      </div>
    );
  }

  return (
    <div style={{ background: '#fbf1de', border: '1px dashed #e6c98a', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#a85c00' }}>✏️ הצעה לאישור מנהל - לא נשמר ישירות</div>
      {[{ key: 'first', label: 'שם פרטי' }, { key: 'last', label: 'שם משפחה' }, { key: 'phone', label: 'טלפון' }, { key: 'email', label: 'מייל' }, ...EDITABLE_CONTACT_FIELDS.filter((f) => !['phone', 'email'].includes(f.key))].map((f) => (
        <div key={f.key}>
          <label style={{ display: 'block', fontSize: 10.5, marginBottom: 2, color: 'var(--text-secondary)' }}>{f.label}</label>
          <input value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} style={inputStyle} />
        </div>
      ))}
      {error && <div style={{ fontSize: 11.5, color: '#c62828' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button" onClick={handleSubmit} disabled={isPending}
          style={{ background: '#a85c00', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
        >
          שלח הצעה
        </button>
        <button type="button" onClick={onDone} disabled={isPending} style={{ background: 'none', border: '1px solid #e6c98a', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

// תצוגה לקריאה בלבד - בלי שום פקד-עריכה, בכוונה: זו התצוגה שטלפן (כולל
// תפקיד "טלפן" הנעול) רואה, ואסור שיהיה בה שום דרך לשנות איש-קשר בטעות.
export default function ContactSummaryPanel({ contact }) {
  const [editing, setEditing] = useState(false);
  const p = contact.personalInfo || {};
  const insights = contact.insights;
  const attempts = contact.attempts || [];
  const address = formatAddress(p);

  return (
    <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...sectionLabel, marginTop: 0 }}>פרטים אישיים</div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--accent, #2f6f4f)', cursor: 'pointer' }}>
            ✏️ הצע תיקון
          </button>
        )}
      </div>

      {editing && <EditSuggestionForm contact={contact} onDone={() => setEditing(false)} />}

      <div style={card}>
        {p.idnum && <div style={fieldRow}><span style={fieldLabel}>ת.ז (לצורך קבלה):</span><span>{p.idnum}</span></div>}
        {contact.email && <div style={fieldRow}><span style={fieldLabel}>מייל:</span><span>{contact.email}</span></div>}
        {p.birth_date && <div style={fieldRow}><span style={fieldLabel}>תאריך לידה:</span><span>{p.birth_date}</span></div>}
        {p.gender && <div style={fieldRow}><span style={fieldLabel}>מגדר:</span><span>{p.gender}</span></div>}
        {(p.children_count || p.children_count === 0) && <div style={fieldRow}><span style={fieldLabel}>מספר ילדים:</span><span>{p.children_count}</span></div>}
        {address && <div style={fieldRow}><span style={fieldLabel}>כתובת:</span><span>{address}</span></div>}
        {contact.relationLabel && (
          <div style={fieldRow}><span style={fieldLabel}>{contact.relationLabel}:</span><span>{contact.spouse ? 'מקושר/ת בקמפיין זה' : 'מקושר/ת'}</span></div>
        )}
        {p.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {p.tags.map((t) => (
              <span key={t} style={{ fontSize: 10.5, background: 'var(--bg, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 999, padding: '2px 8px' }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {contact.departments?.length > 0 && (
        <>
          <div style={sectionLabel}>מה קורה בכל מחלקה</div>
          <div style={card}>
            {contact.departments.map((d, i) => (
              <div key={i} style={fieldRow}>
                <span style={fieldLabel}>{d.workspaceName}:</span>
                <span>{d.stageLabel}{d.lastActivityAt ? ` · פעילות אחרונה ${formatIsraeliDateTime(d.lastActivityAt)}` : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {contact.relations?.length > 0 && (
        <>
          <div style={sectionLabel}>אנשי קשר קשורים</div>
          <div style={card}>
            {contact.relations.map((r, i) => (
              <a key={i} href={`/dashboard/contacts/${r.contactId}`} target="_blank" rel="noreferrer" style={fieldRow}>
                <span style={fieldLabel}>{r.relationLabel}:</span><span style={{ color: 'var(--accent, #2f6f4f)' }}>{r.name}</span>
              </a>
            ))}
          </div>
        </>
      )}

      {(contact.courses?.length > 0 || contact.seminars?.length > 0 || contact.yeshivaInfo) && (
        <>
          <div style={sectionLabel}>לימודים</div>
          <div style={card}>
            {contact.yeshivaInfo && (
              <div style={fieldRow}>
                <span style={fieldLabel}>ישיבת דעת:</span>
                <span>
                  {contact.yeshivaInfo.role ? `${contact.yeshivaInfo.role} · ` : ''}
                  {contact.yeshivaInfo.cohort ? `מחזור ${contact.yeshivaInfo.cohort}` : ''}
                  {contact.yeshivaInfo.studyYears ? ` (${[].concat(contact.yeshivaInfo.studyYears).join(', ')})` : ''}
                </span>
              </div>
            )}
            {contact.courses?.map((c, i) => (
              <div key={i} style={fieldRow}><span style={fieldLabel}>קורס:</span><span>{c.course_name || 'דעת ותבונה'} · {c.year_label}</span></div>
            ))}
            {contact.seminars?.map((s, i) => (
              <div key={i} style={fieldRow}><span style={fieldLabel}>סמינר:</span><span>{s.event_type} · {s.year}</span></div>
            ))}
          </div>
        </>
      )}

      {insights && (
        <>
          <div style={sectionLabel}>הקשר תרומות</div>
          <div style={card}>
            {insights.peakDonation && <div style={fieldRow}><span style={fieldLabel}>שנת-שיא:</span><span>{insights.peakDonation.year} · ₪{insights.peakDonation.amount.toLocaleString()}</span></div>}
            <div style={fieldRow}><span style={fieldLabel}>סה"כ תרומות:</span><span>{insights.totalDonations.count} · ₪{insights.totalDonations.total.toLocaleString()}</span></div>
            {insights.lastDonationDate && <div style={fieldRow}><span style={fieldLabel}>תרומה אחרונה:</span><span>{insights.lastDonationDate}</span></div>}
            {insights.hasActiveCommitment && <div style={fieldRow}><span>יש הוראת קבע פעילה</span></div>}
          </div>
        </>
      )}

      <div style={sectionLabel}>היסטוריית שיחות בקמפיין זה</div>
      {attempts.length === 0 && <div style={{ ...card, color: 'var(--text-muted)' }}>אין עדיין ניסיונות קודמים - זו הפעם הראשונה.</div>}
      {attempts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attempts.map((a) => (
            <div key={a.id} style={card}>
              <div style={{ fontWeight: 600 }}>
                ניסיון {ordinal(a.attemptNumber)} · {a.outcomeLabel}{a.noAnswerReasonLabel ? ` (${a.noAnswerReasonLabel})` : ''}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {a.agentName} · {formatIsraeliDateTime(a.createdAt)}
                {a.callbackAt && ` · חזרה מתוזמנת ל-${formatIsraeliDateTime(a.callbackAt)}`}
              </div>
              {a.note && <div style={{ marginTop: 2 }}>{a.noteTypeLabel && <strong>{a.noteTypeLabel}: </strong>}{a.note}</div>}
              {a.donationAmount != null && <div style={{ marginTop: 2 }}><strong>סכום:</strong> ₪{Number(a.donationAmount).toLocaleString()}</div>}
              {a.dedicationText && <div style={{ marginTop: 2 }}><strong>הקדשה:</strong> {a.dedicationText}</div>}
              {a.pledgeDetails && <div style={{ marginTop: 2 }}><strong>התחייבות:</strong> {a.pledgeDetails}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
