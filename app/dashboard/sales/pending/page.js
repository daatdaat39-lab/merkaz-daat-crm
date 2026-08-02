import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import PendingLeadsClient from './PendingLeadsClient';

// תיבת המתנה/אישור של המנהל - לידים חדשים במחלקת תרומות מגיעים לכאן
// לפני שהם מופיעים לנציגים ברשימת הלידים. המנהל בוחר נציג ומשגר לטיפול.
export default async function PendingLeadsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('current_workspace_id, workspaces:current_workspace_id (name)').eq('id', user.id).single();
  const workspaceId = profile?.current_workspace_id;
  const workspaceName = profile?.workspaces?.name || 'מחלקה';

  const allowed = workspaceId ? await isManagerOfWorkspace(supabase, user.id, workspaceId) : false;
  if (!allowed) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/sales/leads" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה ללידים</a>
        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#92400e' }}>
          רק בעלים או מנהל של המחלקה יכולים לראות את תיבת אישור הלידים.
        </div>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from('contact_departments')
    .select('id, stage, created_at, extra_fields, created_by_manager, contacts:contact_id (id, first, last, phone, email, source), lead_inquiries (reason, source, created_at)')
    .eq('workspace_id', workspaceId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });

  const pending = (rows || []).filter((r) => r.contacts).map((r) => {
    const inquiries = [...(r.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return {
      departmentRowId: r.id,
      contactId: r.contacts.id,
      name: `${r.contacts.first || ''} ${r.contacts.last || ''}`.trim(),
      phone: r.contacts.phone,
      email: r.contacts.email,
      source: r.contacts.source,
      createdAt: r.created_at,
      latestReason: inquiries[0]?.reason || null,
      inquirySource: inquiries[0]?.source || null,
    };
  });

  // רשימת נציגים לבחירה (אין FK בין workspace_members ל-profiles, לכן שתי שאילתות)
  const { data: members } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
  const memberIds = (members || []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from('profiles').select('id, name').in('id', memberIds)
    : { data: [] };
  const admin = createAdminClient();
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = Object.fromEntries((usersList?.users || []).map((u) => [u.id, u.email]));
  const agents = (profiles || []).map((p) => ({ id: p.id, name: p.name || emailById[p.id] || 'משתמש' }));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/sales/leads" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה ללידים</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 6px', fontSize: 20 }}>לידים ממתינים לאישור — {workspaceName}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        לידים חדשים במחלקה זו ממתינים כאן עד שתאשרו אותם ותבחרו נציג מטפל. עד לאישור הם אינם מופיעים ברשימת הלידים של הנציגים.
      </p>
      <PendingLeadsClient initialPending={pending} agents={agents} />
    </div>
  );
}
