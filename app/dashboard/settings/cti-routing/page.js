import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfAnyWorkspace } from '../../lib/contactGuards';
import CtiRoutingClient from './CtiRoutingClient';

// ניתוב-קווים ל-CTI (שלב 5 ממודול מכירות/שירות) - המשתמש אישר שיש
// כמה קווים נפרדים ב-015 (לא קו אחד), אז צריך למפות dnumber (המספר
// הפנימי שחויג אליו) למחלקה כדי לדעת למי לשייך את ההתראה-אחרי-שיחה.
export default async function CtiRoutingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await isManagerOfAnyWorkspace(supabase, user.id);
  if (!allowed) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px' }}>
        <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
        <div style={{ marginTop: 20, background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: 'var(--amber)' }}>
          רק owner/admin יכול לערוך ניתוב-קווים.
        </div>
      </div>
    );
  }

  const [{ data: routings }, { data: workspaces }] = await Promise.all([
    supabase.from('cti_line_routing').select('id, dnumber, label, workspace_id, workspaces:workspace_id (name)').order('created_at'),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
  ]);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <a href="/dashboard/settings" style={{ fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' }}>← חזרה להגדרות</a>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '14px 0 4px', fontSize: 20 }}>ניתוב-קווים (CTI)</h1>
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        מיפוי בין מספר-קו פנימי ב-015 (dnumber) לבין מחלקה - קובע לאיזו מחלקה לשייך התראת שיחה-נכנסת.
        את ה-dnumber רואים בשורת שיחה קיימת בכרטיס איש-קשר, תחת "שיחות".
      </p>
      <CtiRoutingClient routings={routings || []} workspaces={workspaces || []} />
    </div>
  );
}
