import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { initials } from '../components/ui';

// רשימת שיחות WhatsApp שממתינות לתגובה שלנו - כלומר ההודעה האחרונה
// בשיחה (לכל מספר טלפון) הגיעה מהלקוח ועדיין לא נשלחה תשובה אחריה.
export default async function WhatsappPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase
    .from('sent_whatsapp')
    .select('id, contact_id, phone, direction, kind, message, reason, sent_at, contacts:contact_id (id, first, last)')
    .order('sent_at', { ascending: false })
    .limit(500);

  const latestByPhone = new Map();
  for (const row of rows || []) {
    if (!latestByPhone.has(row.phone)) latestByPhone.set(row.phone, row);
  }
  const pending = [...latestByPhone.values()].filter((r) => r.direction === 'in');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 6px', fontSize: 20 }}>WhatsApp — ממתינים לתגובה</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 12.5 }}>
        {pending.length} שיחות שההודעה האחרונה בהן הגיעה מהלקוח ועדיין לא נענתה
      </p>

      {pending.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          🎉 אין שיחות ממתינות כרגע
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pending.map((r) => (
          <Link
            key={r.id}
            href={r.contact_id ? `/dashboard/contacts/${r.contact_id}` : '#'}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit',
              background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
            }}
          >
            <span style={{
              width: 34, height: 34, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, flexShrink: 0,
            }}>
              {r.contacts ? initials(r.contacts.first, r.contacts.last) : '?'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                {r.contacts ? `${r.contacts.first} ${r.contacts.last}` : r.phone}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.message || `הודעת תבנית${r.reason ? ` — ${r.reason}` : ''}`}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
              {new Date(r.sent_at).toLocaleDateString('he-IL')} {new Date(r.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
