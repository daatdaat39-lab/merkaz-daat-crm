import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import NewCampaignForm from './NewCampaignForm';
import DeleteCampaignButton from './DeleteCampaignButton';

// רשימת קמפייני התרומות של המחלקה הפעילה + יצירת קמפיין חדש.
// ניהול אנשי הקשר בתוך קמפיין נמצא בעמוד הפנימי [id].
export default async function CampaignsPage() {
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
          רק בעלים או מנהל של המחלקה יכולים לנהל קמפיינים.
        </div>
      </div>
    );
  }

  const { data: campaignRows } = await supabase
    .from('campaigns')
    .select('id, name, channel, status, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  // ספירה מדויקת (count: 'exact') ולא embedded-array.length - embed
  // מסונן-ל-1000 באותו אופן שכל select רגיל בלי range() מוגבל, ואומת
  // בפועל: קמפיין "דעת" הציג 1000 בעוד יש לו 1443 אנשי קשר אמיתיים.
  const campaigns = await Promise.all((campaignRows || []).map(async (c) => {
    const { count } = await supabase.from('campaign_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id);
    return { ...c, contactCount: count || 0 };
  }));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/sales/leads" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה ללידים</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '14px 0 20px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', margin: 0, fontSize: 20 }}>קמפיינים — {workspaceName}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            קבוצת אנשי קשר שמטופלת יחד — מחולקת לקטגוריות, משויכת לנציגים, עם ערוץ פעולה מוגדר.
          </p>
        </div>
        <NewCampaignForm workspaceId={workspaceId} />
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
        {(campaigns || []).length === 0 && (
          <div style={{ padding: '16px 18px', fontSize: 13, color: '#9b9b9b' }}>עדיין לא נוצרו קמפיינים</div>
        )}
        {(campaigns || []).map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/sales/campaigns/${c.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
              borderBottom: '1px solid #f2f2f2', textDecoration: 'none', color: 'inherit',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 2 }}>
                נוצר {new Date(c.created_at).toLocaleDateString('he-IL')}
                {c.channel && ` · ערוץ: ${c.channel}`}
              </div>
            </div>
            <span style={{ fontSize: 12.5, color: '#6b6b6b' }}>{c.contactCount} אנשי קשר</span>
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 100, padding: '3px 10px',
              background: c.status === 'closed' ? '#f3f4f6' : '#f0fdf4',
              color: c.status === 'closed' ? '#6b7280' : '#15803d',
            }}>
              {c.status === 'closed' ? 'סגור' : 'פעיל'}
            </span>
            <DeleteCampaignButton campaignId={c.id} campaignName={c.name} />
          </Link>
        ))}
      </div>
    </div>
  );
}
