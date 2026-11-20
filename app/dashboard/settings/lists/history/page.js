import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../../lib/contactGuards';
import { getAllListSummaries, getListMembers } from '../actions';

// "כל הרשימות" - רשימת-כל-השמות-שנוצרו-אי-פעם (ספירה + תאריך-אחרון),
// לחיצה (?title=...) פותחת את מי-שהיה-בה. owner/admin בלבד, כמו מסך-הבנייה.
export default async function AllListsPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isManagerOfAnyWorkspace(supabase, user.id))) redirect('/dashboard/settings');

  const selectedTitle = searchParams?.title || null;
  const [summaries, members] = await Promise.all([
    getAllListSummaries(),
    selectedTitle ? getListMembers(selectedTitle) : Promise.resolve(null),
  ]);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings/lists" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה לבניית רשימה</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 20px', fontSize: 20 }}>כל הרשימות</h1>

      {!selectedTitle && (
        <div>
          {summaries.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>עדיין לא נוצרו רשימות.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {summaries.map((s) => (
                <a
                  key={s.title}
                  href={`/dashboard/settings/lists/history?title=${encodeURIComponent(s.title)}`}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--text)',
                    border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 14px', fontSize: 13,
                  }}
                >
                  <span>{s.title}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary, #6b6b6b)' }}>
                    {s.count} אנשי-קשר · {new Date(s.lastAt).toLocaleDateString('he-IL')}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTitle && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>{selectedTitle}</h2>
            <a href="/dashboard/settings/lists/history" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>← כל הרשימות</a>
          </div>
          {(!members || members.length === 0) ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>אין אנשי-קשר ברשימה הזו.</p>
          ) : (
            <div style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary, #f9f9f9)' }}>
                    <th style={{ padding: 8, textAlign: 'right' }}>שם</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>טלפון</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>נכנס בתאריך</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                      <td style={{ padding: 8 }}>
                        {m.contacts ? (
                          <a href={`/dashboard/contacts/${m.contacts.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                            {m.contacts.first} {m.contacts.last}
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ padding: 8 }}>{m.contacts?.phone || '—'}</td>
                      <td style={{ padding: 8 }}>{new Date(m.created_at).toLocaleDateString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
