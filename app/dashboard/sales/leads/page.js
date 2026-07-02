import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, initials, DEPT_KEYWORDS, contactMatchesDept } from '../../components/ui';

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
      .select('id, first, last, phone, email, source, stage, dept, tags, created_at')
      .eq('workspace_id', workspaceId)
      .in('stage', ['open', 'meeting'])
      .order('created_at', { ascending: false });
    leads = data || [];
  }

  // מחלקים לתת-קטגוריות לפי תגית (לצורך ארגון בלבד - כל חברי ה-workspace רואים הכל)
  const departments = Object.keys(DEPT_KEYWORDS);
  const categorized = departments
    .map((dept) => ({ dept, leads: leads.filter((l) => contactMatchesDept(l, dept)) }))
    .filter((group) => group.leads.length > 0);

  const categorizedIds = new Set(categorized.flatMap((g) => g.leads.map((l) => l.id)));
  const uncategorized = leads.filter((l) => !categorizedIds.has(l.id));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 20 }}>לידים</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5 }}>
          {leads.length} לידים פתוחים, מחולקים לתת-קטגוריות
        </p>
      </div>

      {categorized.map((group) => (
        <LeadGroup key={group.dept} title={group.dept} leads={group.leads} />
      ))}

      {uncategorized.length > 0 && <LeadGroup title="ללא תגית מזוהה" leads={uncategorized} />}

      {leads.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>אין לידים פתוחים כרגע</div>
      )}
    </div>
  );
}

function LeadGroup({ title, leads }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
        {title} ({leads.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['שם', 'סטטוס', 'טלפון', 'מייל', 'מקור', 'נוצר'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                  <span style={{ width: 26, height: 26, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {initials(c.first, c.last)}
                  </span>
                  {c.first} {c.last}
                </Link>
              </td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}><StageBadge stage={c.stage} /></td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.phone || '—'}</td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.email || '—'}</td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>{c.source || '—'}</td>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString('he-IL')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
