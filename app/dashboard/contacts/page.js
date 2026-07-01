import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, Tag, initials } from '../components/ui';

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
      .select('id, first, last, phone, email, dept, tags, stage, source, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    contacts = data || [];
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>אנשי קשר</h1>
        <p style={{ margin: '4px 0 0', color: '#6b6b6b', fontSize: 12.5 }}>
          {contacts.length} אנשי קשר ב-workspace הפעיל
        </p>
      </div>

      {!workspaceId && (
        <div
          style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
            padding: '12px 16px', fontSize: 12.5, marginBottom: 18, color: '#92400e',
          }}
        >
          לא נמצא workspace פעיל עבור המשתמש.
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f9f9f9' }}>
            {['שם', 'סטטוס', 'טלפון', 'מייל', 'תחום', 'מקור', 'תגיות'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: '#9b9b9b', padding: '10px 16px', textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                  <span style={{
                    width: 28, height: 28, background: '#f2f2f2', border: '1px solid #e5e5e5', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#6b6b6b', flexShrink: 0,
                  }}>
                    {initials(c.first, c.last)}
                  </span>
                  {c.first} {c.last}
                </Link>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}><StageBadge stage={c.stage} /></td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.dept || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.source || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                {(c.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
                {(!c.tags || c.tags.length === 0) && '—'}
              </td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr><td colSpan={7} style={{ padding: '12px 16px', fontSize: 13, color: '#9b9b9b' }}>אין אנשי קשר</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
