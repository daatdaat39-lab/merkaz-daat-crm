import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { initials } from '../components/ui';

// 015 שולחת direction כ-"inbound"/"outbound" (אומת מריצה חיה - לא
// "in"/"out" כמו שהונח בהתחלה).
function statusPill(call) {
  if (call.direction === 'inbound' && !call.answered) return { label: 'לא נענתה', bg: '#fdecea', fg: '#c62828' };
  if (call.answered) return { label: 'נענתה', bg: '#e8f5e9', fg: '#2e7d32' };
  return { label: call.status || 'לא ידוע', bg: 'var(--bg-secondary, #f0f0f0)', fg: 'var(--text-secondary)' };
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// יומן שיחות מ-015 (hallo015) - נכתב אך ורק ע"י ה-webhook בסיום שיחה
// (app/api/webhooks/hallo015-call/route.js), קריאה בלבד כאן. אין חיוג
// יוצא נתמך - ר' ContactQuickActions.js.
export default async function CallsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase
    .from('phone_calls')
    .select('id, contact_id, direction, snumber, dnumber, extension, status, answered, duration_seconds, recording_url, started_at, contacts:contact_id (id, first, last)')
    .order('started_at', { ascending: false })
    .limit(200);

  const calls = rows || [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 6px', fontSize: 20 }}>שיחות (015)</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 12.5 }}>
        {calls.length} שיחות אחרונות שהתקבלו ממערכת הטלפוניה
      </p>

      {calls.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          עדיין לא התקבלה אף שיחה - ודאו שהחיבור ל-015 מוגדר בהגדרות המערכת.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {calls.map((c) => {
          const pill = statusPill(c);
          const otherNumber = c.direction === 'inbound' ? c.snumber : c.dnumber;
          return (
            <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 34, height: 34, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, flexShrink: 0,
                }}>
                  {c.contacts ? initials(c.contacts.first, c.contacts.last) : '?'}
                </span>
                <Link
                  href={c.contact_id ? `/dashboard/contacts/${c.contact_id}` : '#'}
                  style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {c.direction === 'inbound' ? '⬅️ ' : '➡️ '}
                    {c.contacts ? `${c.contacts.first} ${c.contacts.last}` : otherNumber || 'מספר לא ידוע'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatDuration(c.duration_seconds) && `משך: ${formatDuration(c.duration_seconds)}`}
                    {c.extension && ` · שלוחה: ${c.extension}`}
                  </div>
                </Link>
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: pill.bg, color: pill.fg, flexShrink: 0 }}>
                  {pill.label}
                </span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(c.started_at).toLocaleDateString('he-IL')} {new Date(c.started_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {c.recording_url && (
                <audio controls src={c.recording_url} style={{ width: '100%', height: 32, marginTop: 8 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
