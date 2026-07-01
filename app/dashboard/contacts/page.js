import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ContactsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let contacts = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('contacts')
      .select('id, first, last, phone, email, dept, tags, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    contacts = data || [];
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>אנשי קשר</h1>
        <p style={{ margin: '4px 0 0', color: '#6B6151', fontSize: 12.5 }}>
          {contacts.length} אנשי קשר ב-workspace הפעיל
        </p>
      </div>

      {!workspaceId && (
        <div
          style={{
            background: '#FBF3E7',
            border: '1px solid #EAD8B4',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 12.5,
            marginBottom: 18,
            color: '#7A5A21',
          }}
        >
          לא נמצא workspace פעיל עבור המשתמש. יש לפנות למנהל המערכת.
        </div>
      )}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: '#FFFDF6',
          border: '1px solid #DFD2AC',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <thead>
          <tr style={{ background: '#EFE6CC' }}>
            {['שם', 'טלפון', 'מייל', 'תחום', 'תגיות'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11.5, color: '#6B6151', padding: '10px 12px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #DFD2AC' }}>
              <td style={{ padding: '10px 12px', fontSize: 13 }}>{c.first} {c.last}</td>
              <td style={{ padding: '10px 12px', fontSize: 13 }}>{c.phone || '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 13 }}>{c.dept || '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 13 }}>{(c.tags || []).join(', ') || '—'}</td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '10px 12px', fontSize: 13, color: '#6B6151' }}>
                אין אנשי קשר
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
