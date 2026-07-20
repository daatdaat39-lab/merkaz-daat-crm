import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NotConnectedButton from '../components/NotConnectedButton';
import WhatsAppTemplatesPanel from './WhatsAppTemplatesPanel';
import EmailTemplatesPanel from './EmailTemplatesPanel';

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
  let memberCount = 0;
  if (workspaceId) {
    const [{ data: ws }, { count }] = await Promise.all([
      supabase.from('workspaces').select('id, name, created_at').eq('id', workspaceId).single(),
      supabase.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);
    workspace = ws;
    memberCount = count || 0;
  }

  const { data: whatsappTemplates } = await supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('created_at');
  const { data: emailTemplates } = await supabase.from('email_templates').select('id, name, subject, body').order('created_at');

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

      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>חברי הצוות</div>
          <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 2 }}>{memberCount} משתמשים ב-workspace</div>
        </div>
        <Link href="/dashboard/settings/users" style={{
          background: '#0a0a0a', color: '#fff', textDecoration: 'none', fontSize: 13,
          padding: '7px 16px', borderRadius: 6,
        }}>
          ניהול משתמשים →
        </Link>
      </div>

      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>דוח פעילות נציגים</div>
          <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 2 }}>זמן פעילות ותפוקה לכל נציג (owner/admin בלבד)</div>
        </div>
        <Link href="/dashboard/settings/activity" style={{
          background: '#fff', color: '#0a0a0a', border: '1px solid #e5e5e5', textDecoration: 'none', fontSize: 13,
          padding: '7px 16px', borderRadius: 6,
        }}>
          לדוח →
        </Link>
      </div>

      <WhatsAppTemplatesPanel templates={whatsappTemplates || []} />
      <EmailTemplatesPanel templates={emailTemplates || []} />

      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600 }}>
          אינטגרציות
        </div>
        {[
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
        אינטגרציות (מייל/וואטסאפ/טלפוניה) יתווספו בשלב הבא — ניהול משתמשים כבר פעיל.
      </div>
    </div>
  );
}
