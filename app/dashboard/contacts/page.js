import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StageBadge, Tag, initials, contactMatchesDept } from '../components/ui';
import NotConnectedButton from '../components/NotConnectedButton';

export default async function ContactsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, dept')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  const { data: myMembership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  const isManager = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const viewerDept = isManager ? null : profile?.dept;

  let contacts = [];
  if (workspaceId) {
    const { data } = await supabase
      .from('contacts')
      .select('id, first, last, phone, email, dept, tags, stage, source, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    contacts = (data || []).filter((c) => contactMatchesDept(c, viewerDept));
  }

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: 20 }}>אנשי קשר</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            {contacts.length} אנשי קשר{viewerDept ? ` — מסונן למחלקת "${viewerDept}"` : ' ב-workspace הפעיל'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <NotConnectedButton label="ייבוא מאקסל" icon="⬆" message="ייבוא מאקסל — עדיין לא מחובר" />
          <NotConnectedButton label="איש קשר חדש" icon="+" variant="primary" message="הוספת איש קשר ידנית — בקרוב" />
        </div>
      </div>

      {!workspaceId && (
        <div
          style={{
            background: 'var(--amber-bg)', border: '1px solid #fde68a', borderRadius: 8,
            padding: '12px 16px', fontSize: 12.5, marginBottom: 18, color: '#92400e',
          }}
        >
          לא נמצא workspace פעיל עבור המשתמש.
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['שם', 'סטטוס', 'טלפון', 'מייל', 'תחום', 'מקור', 'תגיות', 'פעולות מהירות'].map((h) => (
              <th key={h} style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', padding: '10px 16px', textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <Link href={`/dashboard/contacts/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', fontWeight: 500 }}>
                  <span style={{
                    width: 28, height: 28, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0,
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
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <NotConnectedButton icon="📞" label="חיוג" variant="icon" message="חיוג מתוך המערכת — עדיין לא מחובר" />
                  <NotConnectedButton icon="💬" label="וואטסאפ" variant="icon" message="וואטסאפ — עדיין לא מחובר" />
                  <NotConnectedButton icon="✉️" label="מייל" variant="icon" message="שליחת מייל — עדיין לא מחובר" />
                </div>
              </td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr><td colSpan={8} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>אין אנשי קשר</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
