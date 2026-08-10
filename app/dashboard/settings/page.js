import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NotConnectedButton from '../components/NotConnectedButton';
import WhatsAppTemplatesPanel from './WhatsAppTemplatesPanel';
import EmailTemplatesPanel from './EmailTemplatesPanel';
import { card, iconBlock, sectionLabel } from '../components/designTokens';
import { isKesherConfigured } from '../../../lib/kesher/client';
import { isInforuConfigured, isInforuWebhookConfigured } from '../../../lib/inforu/whatsapp';

const SETTINGS_LINKS = [
  { href: '/dashboard/settings/users', icon: '👥', title: 'חברי הצוות', desc: 'ניהול משתמשים והרשאות' },
  { href: '/dashboard/settings/activity', icon: '📊', title: 'דוח פעילות נציגים', desc: 'זמן פעילות ותפוקה לכל נציג (owner/admin בלבד)' },
  { href: '/dashboard/settings/duplicates', icon: '🔎', title: 'בדיקת כפליות', desc: 'סריקת אנשי קשר למיזוג כפילויות (owner/admin בלבד)' },
  { href: '/dashboard/settings/import', icon: '📥', title: 'ייבוא נתונים', desc: 'ייבוא/ייצוא אנשי קשר, מערכת חיצונית, היסטוריית שיחות' },
  { href: '/dashboard/settings/lead-sources', icon: '📨', title: 'מקורות לידים', desc: 'חיבורי מייל לכל מחלקה, ניתוב מייל לקמפיינים, ורשימת מקורות (owner/admin בלבד)' },
  { href: '/dashboard/settings/import-conflicts', icon: '⚠', title: 'קונפליקטים בייבוא', desc: 'ערכים מקבצי ייבוא שהתנגשו עם נתון קיים - בדיקה ופתרון אחד-אחד (owner/admin בלבד)' },
  { href: '/dashboard/settings/picklists', icon: '🏷', title: 'רשימות בחירה', desc: 'קטגוריות קמפיין, סוגי תורם וסיבות סגירה (owner/admin בלבד)' },
  { href: '/dashboard/settings/pipelines', icon: '🔀', title: 'שלבי pipeline', desc: 'הוספה/עריכה/סידור שלבי התהליך לכל מחלקה (owner/admin בלבד)' },
  { href: '/dashboard/settings/fields', icon: '🧩', title: 'שדות מחלקתיים', desc: 'הוספה/עריכה/סידור שדות נוספים לכל מחלקה (owner/admin בלבד)' },
  { href: '/dashboard/settings/insights', icon: '💡', title: 'תובנות והצעות AI', desc: 'ניתוח מדדים אמיתיים והצעות מעשיות למחלקה (owner/admin בלבד)' },
  { href: '/dashboard/settings/data-grid', icon: '🗂', title: 'ניהול נתונים מרכזי', desc: 'טבלת עריכה מהירה לכל אנשי הקשר של מחלקה - שדות בסיס, שדות נוספים ושלב (owner/admin בלבד)' },
];

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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 20px', fontSize: 20 }}>הגדרות</h1>

      <div style={card({ padding: '18px 20px', marginBottom: 24 })}>
        <div style={sectionLabel}>Workspace פעיל</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{workspace?.name || '—'}</div>
        {workspace?.created_at && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            נוצר בתאריך {new Date(workspace.created_at).toLocaleDateString('he-IL')} · {memberCount} משתמשים
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
        {SETTINGS_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="card-hover" style={{ ...iconBlock(), textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: 28 }}>{item.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
          </Link>
        ))}
      </div>

      <WhatsAppTemplatesPanel templates={whatsappTemplates || []} />
      <EmailTemplatesPanel templates={emailTemplates || []} />

      <div style={{ ...card(), overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
          אינטגרציות
        </div>
        {[
          { label: 'טלפוניה (ימות המשיח)', desc: 'חיוג, הקלטות, תמלול', configured: false },
          { label: 'SMS', desc: 'שליחה ידנית ואוטומטית', configured: false },
          {
            label: 'WhatsApp (InforU)', desc: 'שליחה וקבלה של הודעות',
            configured: isInforuConfigured(),
            note: isInforuConfigured() && !isInforuWebhookConfigured()
              ? 'שליחה מחוברת, קליטת הודעות נכנסות עדיין לא (חסר INFORU_WEBHOOK_SECRET)'
              : null,
          },
          { label: 'קשר (סליקה וקבלות)', desc: 'תרומות, הוראות קבע, קבלות', configured: isKesherConfigured() },
          { label: 'Google Calendar', desc: 'סנכרון פגישות', configured: false },
        ].map((item) => (
          <div key={item.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 18px', borderBottom: '1px solid var(--bg-tertiary)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{item.desc}</div>
              {item.note && <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>⚠ {item.note}</div>}
            </div>
            {item.configured ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ✓ מחובר
              </span>
            ) : (
              <NotConnectedButton label="חיבור" message={`חיבור ${item.label} — עדיין לא מחובר`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
