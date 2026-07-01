import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, initials } from '../../components/ui';

export default async function SalesLeadsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let leads = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('contacts')
      .select('id, first, last, phone, email, source, stage, created_at')
      .eq('workspace_id', workspaceId)
      .in('stage', ['open', 'meeting'])
      .order('created_at', { ascending: false });
    leads = data || [];
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>לידים</h1>
        <p style={{ margin: '4px 0 0', color: '#6b6b6b', fontSize: 12.5 }}>לידים פתוחים שטרם נסגרו ({leads.length})</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f9f9f9' }}>
            {['שם', 'סטטוס', 'טלפון', 'מייל', 'מקור', 'נוצר'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: '#9b9b9b', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                  <span style={{ width: 26, height: 26, background: '#f2f2f2', border: '1px solid #e5e5e5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, color: '#6b6b6b', flexShrink: 0 }}>
                    {initials(c.first, c.last)}
                  </span>
                  {c.first} {c.last}
                </Link>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}><StageBadge stage={c.stage} /></td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.source || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString('he-IL')}</td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '12px 16px', fontSize: 13, color: '#9b9b9b' }}>אין לידים פתוחים כרגע</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
