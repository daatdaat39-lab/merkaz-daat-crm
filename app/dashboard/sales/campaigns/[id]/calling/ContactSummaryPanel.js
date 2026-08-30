'use client';

const sectionLabel = { fontSize: 10, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '16px 0 6px' };
const fieldRow = { display: 'flex', gap: 6, fontSize: 12.5, marginBottom: 3 };
const fieldLabel = { color: 'var(--text-secondary)', flexShrink: 0 };

const ATTEMPT_ORDINALS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'];
function ordinal(n) {
  return ATTEMPT_ORDINALS[n - 1] || `#${n}`;
}

function formatAddress(p) {
  const parts = [p.street, p.house_number, p.apartment ? `דירה ${p.apartment}` : null, p.city, p.zip_code].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// תצוגה לקריאה בלבד - בלי שום פקד-עריכה, בכוונה: זו התצוגה שטלפן (כולל
// תפקיד "טלפן" הנעול) רואה, ואסור שיהיה בה שום דרך לשנות איש-קשר בטעות.
export default function ContactSummaryPanel({ contact }) {
  const p = contact.personalInfo || {};
  const insights = contact.insights;
  const attempts = contact.attempts || [];
  const address = formatAddress(p);

  return (
    <div style={{ fontSize: 12.5 }}>
      <div style={sectionLabel}>פרטים אישיים</div>
      {p.idnum && <div style={fieldRow}><span style={fieldLabel}>ת.ז:</span><span>{p.idnum}</span></div>}
      {p.birth_date && <div style={fieldRow}><span style={fieldLabel}>תאריך לידה:</span><span>{p.birth_date}</span></div>}
      {p.gender && <div style={fieldRow}><span style={fieldLabel}>מגדר:</span><span>{p.gender}</span></div>}
      {(p.children_count || p.children_count === 0) && <div style={fieldRow}><span style={fieldLabel}>מספר ילדים:</span><span>{p.children_count}</span></div>}
      {address && <div style={fieldRow}><span style={fieldLabel}>כתובת:</span><span>{address}</span></div>}
      {contact.email && <div style={fieldRow}><span style={fieldLabel}>מייל:</span><span>{contact.email}</span></div>}
      {contact.relationLabel && (
        <div style={fieldRow}><span style={fieldLabel}>{contact.relationLabel}:</span><span>{contact.spouse ? 'מקושר/ת בקמפיין זה' : 'מקושר/ת'}</span></div>
      )}
      {p.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {p.tags.map((t) => (
            <span key={t} style={{ fontSize: 10.5, background: 'var(--bg-secondary, #f0f0f0)', borderRadius: 999, padding: '2px 8px' }}>{t}</span>
          ))}
        </div>
      )}

      {insights && (
        <>
          <div style={sectionLabel}>הקשר תרומות</div>
          {insights.peakDonation && <div style={fieldRow}><span style={fieldLabel}>שנת-שיא:</span><span>{insights.peakDonation.year} · ₪{insights.peakDonation.amount.toLocaleString()}</span></div>}
          <div style={fieldRow}><span style={fieldLabel}>סה"כ תרומות:</span><span>{insights.totalDonations.count} · ₪{insights.totalDonations.total.toLocaleString()}</span></div>
          {insights.lastDonationDate && <div style={fieldRow}><span style={fieldLabel}>תרומה אחרונה:</span><span>{insights.lastDonationDate}</span></div>}
          {insights.hasActiveCommitment && <div style={fieldRow}><span>יש הוראת קבע פעילה</span></div>}
        </>
      )}

      <div style={sectionLabel}>היסטוריית שיחות בקמפיין זה</div>
      {attempts.length === 0 && <div style={{ color: 'var(--text-muted)' }}>אין עדיין ניסיונות קודמים - זו הפעם הראשונה.</div>}
      {attempts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attempts.map((a) => (
            <div key={a.id} style={{ background: 'var(--bg-secondary, #f7f7f7)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontWeight: 600 }}>
                ניסיון {ordinal(a.attemptNumber)} · {a.outcomeLabel}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {a.agentName} · {new Date(a.createdAt).toLocaleString('he-IL')}
                {a.callbackAt && ` · חזרה מתוזמנת ל-${new Date(a.callbackAt).toLocaleString('he-IL')}`}
              </div>
              {a.note && <div style={{ marginTop: 4 }}>{a.noteTypeLabel && <strong>{a.noteTypeLabel}: </strong>}{a.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
