import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import NotConnectedButton from '../components/NotConnectedButton';

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, current_workspace_id')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  let workspace = null;
  let members = [];
  if (workspaceId) {
    const [{ data: ws }, { data: mem }] = await Promise.all([
      supabase.from('workspaces').select('id, name, created_at').eq('id', workspaceId).single(),
      supabase.from('workspace_members').select('role, profiles(name, role)').eq('workspace_id', workspaceId),
    ]);
    workspace = ws;
    members = mem || [];
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: '0 0 20px', fontSize: 20 }}>הגדרות</h1>

      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#9b9b9b', marginBottom: 6 }}>Workspace פעיל</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{workspace?.name || '—'}</div>
        {workspace?.created_at && (
          <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 4 }}>
            נוצר בתאריך {new Date(workspace.created_at).toLocaleDateString('he-IL')}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600 }}>
          חברי הצוות ({members.length})
        </div>
        {members.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid #f2f2f2', fontSize: 13 }}>
            <span>{m.profiles?.name || 'משתמש'}</span>
            <span style={{
              fontSize: 11, color: '#6b6b6b', background: '#f2f2f2', padding: '2px 9px', borderRadius: 10,
            }}>
              {m.role === 'owner' ? 'בעלים' : m.role === 'admin' ? 'מנהל' : 'חבר'}
            </span>
          </div>
        ))}
        {members.length === 0 && <div style={{ padding: '14px 18px', fontSize: 13, color: '#9b9b9b' }}>אין חברים</div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600 }}>
          אינטגרציות
        </div>
        {[
          { label: 'WhatsApp Business', desc: 'שליחה וקבלה מתוך המערכת' },
          { label: 'Google Workspace (Email)', desc: 'תיבת מייל נפרדת ל-workspace' },
          { label: 'טלפוניה (ימות המשיח)', desc: 'חיוג, הקלטות, תמלול' },
          { label: 'SMS', desc: 'שליחה ידנית ואוטומטית' },
          { label: 'קשר (סליקה וקבלות)', desc: 'תרומות, הוראות קבע, קבלות' },
          { label: 'Google Calendar', desc: 'סנכרון פגישות' },
          { label: 'מנוע אוטומציות', desc: 'טריגר → תנאי → פעולה' },
        ].map((item) => (
          <div key={item.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 18px', borderBottom: '1px solid #f2f2f2',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 11.5, color: '#9b9b9b' }}>{item.desc}</div>
            </div>
            <NotConnectedButton label="חיבור" message={`חיבור ${item.label} — עדיין לא מחובר`} />
          </div>
        ))}
      </div>

      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px',
        fontSize: 12.5, color: '#92400e',
      }}>
        ניהול הזמנות חברי צוות חדשים ואינטגרציות (מייל/וואטסאפ) יתווספו בשלב הבא.
      </div>
    </div>
  );
}
