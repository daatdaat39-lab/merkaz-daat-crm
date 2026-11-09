import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NotConnectedButton from '../components/NotConnectedButton';
import WhatsAppTemplatesPanel from './WhatsAppTemplatesPanel';
import EmailTemplatesPanel from './EmailTemplatesPanel';
import { TemplateCoverage } from './TemplateTargeting';
import { card, iconBlock, sectionLabel } from '../components/designTokens';
import { isKesherConfigured } from '../../../lib/kesher/client';
import { isInforuConfigured, isInforuWebhookConfigured } from '../../../lib/inforu/whatsapp';
import { isHallo015Configured } from '../../../lib/hallo015/config';
import { isClickToDialConfigured } from '../../../lib/hallo015/clickToDial';
import { UsersIcon, BarChartIcon, SearchIcon, InboxDownIcon, SettingsGearIcon, MailIcon, CheckSquareIcon, TicketIcon, TargetIcon, PhoneIcon, RouteIcon, SparkleIcon, ApprovalIcon } from '../components/icons';

// managerOnly - לא-רק-תיאור-טקסטואלי: נאכף-בפועל (ר' SettingsPage) ע"י
// סינון-הרשימה-עצמה, לא-רק-חסימה-אחרי-כניסה. "ייבוא נתונים" כולל ייצוא
// המוני של ת"ז - למנהלים בלבד (גם העמוד עצמו מפנה החוצה אם אינך מנהל).
// "ההעדפות שלי" פתוח לכולם - כך שנציג רגיל מקבל מסך הגדרות שימושי.
const SETTINGS_LINKS = [
  { href: '/dashboard/settings/users', icon: UsersIcon, title: 'חברי הצוות', desc: 'ניהול משתמשים והרשאות', managerOnly: true },
  { href: '/dashboard/settings/activity', icon: BarChartIcon, title: 'דוח פעילות נציגים', desc: 'זמן פעילות ותפוקה לכל נציג (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/duplicates', icon: SearchIcon, title: 'בדיקת כפליות', desc: 'סריקת אנשי קשר למיזוג כפילויות (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/import', icon: InboxDownIcon, title: 'ייבוא נתונים', desc: 'ייבוא/ייצוא אנשי קשר, מערכת חיצונית, היסטוריית שיחות (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/my-preferences', icon: SettingsGearIcon, title: 'ההעדפות שלי', desc: 'תצוגה, שדות מוסתרים והעדפות אישיות' },
  { href: '/dashboard/settings/lead-sources', icon: MailIcon, title: 'מקורות לידים', desc: 'חיבורי מייל לכל מחלקה, ניתוב מייל לקמפיינים, ורשימת מקורות (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/picklists', icon: CheckSquareIcon, title: 'רשימות בחירה', desc: 'קטגוריות קמפיין, סוגי תורם וסיבות סגירה (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/reference-content', icon: TicketIcon, title: 'תוכן-עזר למכירות ושירות', desc: 'תסריטי-מכירה וטיפול-בהתנגדויות, ומאגר-ידע לשירות - לפי קורס (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/courses', icon: TargetIcon, title: 'קטלוג קורסים', desc: 'הוספה/עריכה של קורסים - שם, מחיר, משך (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/cti-routing', icon: PhoneIcon, title: 'ניתוב-קווים (CTI)', desc: 'מיפוי בין קו-טלפון פנימי ב-015 למחלקה, לצורך התראות-שיחה (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/pipelines', icon: RouteIcon, title: 'שלבי pipeline', desc: 'הוספה/עריכה/סידור שלבי התהליך לכל מחלקה (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/fields', icon: SettingsGearIcon, title: 'שדות מחלקתיים', desc: 'הוספה/עריכה/סידור שדות נוספים לכל מחלקה (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/insights', icon: SparkleIcon, title: 'תובנות והצעות AI', desc: 'ניתוח מדדים אמיתיים והצעות מעשיות למחלקה (owner/admin בלבד)', managerOnly: true },
  { href: '/dashboard/settings/data-grid', icon: ApprovalIcon, title: 'ניהול נתונים מרכזי', desc: 'טבלת עריכה מהירה לכל אנשי הקשר של מחלקה - שדות בסיס, שדות נוספים ושלב (owner/admin בלבד)', managerOnly: true },
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
  let canManage = false;
  if (workspaceId) {
    const [{ data: ws }, { count }, { data: myMembership }] = await Promise.all([
      supabase.from('workspaces').select('id, name, created_at').eq('id', workspaceId).single(),
      supabase.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single(),
    ]);
    workspace = ws;
    memberCount = count || 0;
    canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  }

  const visibleLinks = SETTINGS_LINKS.filter((item) => !item.managerOnly || canManage);

  // תבניות + נתוני השיוך שלהן (מחלקה/שלב/קורס) - נטענים רק למנהלים, כי רק הם רואים את הפאנלים
  let whatsappTemplates = [];
  let emailTemplates = [];
  let templateWorkspaces = [];
  let stagesByWorkspace = {};
  let templateCourses = [];
  if (canManage) {
    const [wa, em, ws, stages, courses, myManagerRows] = await Promise.all([
      supabase.from('whatsapp_templates').select('id, name, template_id, preview_text, param_count, sort_order, workspace_id, stage_key, category, course_id, is_active').order('sort_order').order('created_at'),
      supabase.from('email_templates').select('id, name, subject, body, workspace_id, stage_key, category, course_id, is_active').order('created_at'),
      supabase.from('workspaces').select('id, name, sells_courses').order('created_at', { ascending: true }),
      supabase.from('pipeline_stages').select('workspace_id, stage_key, label, sort_order, is_side_stage').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('courses').select('id, name, is_active').order('sort_order').order('name'),
      supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).in('role', ['owner', 'admin']),
    ]);
    whatsappTemplates = wa.data || [];
    emailTemplates = em.data || [];
    templateCourses = courses.data || [];
    // שיוך תבנית למחלקה מותר רק למי שמנהל אותה (נאכף גם בשרת) - לכן הרשימה לבחירה מסומנת
    const managedIds = new Set((myManagerRows.data || []).map((r) => r.workspace_id));
    templateWorkspaces = (ws.data || []).map((w) => ({ ...w, canManage: managedIds.has(w.id) }));
    for (const s of stages.data || []) {
      (stagesByWorkspace[s.workspace_id] = stagesByWorkspace[s.workspace_id] || []).push(s);
    }
  }

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
        {visibleLinks.map((item) => (
          <Link key={item.href} href={item.href} className="card-hover" style={{ ...iconBlock(), textDecoration: 'none', color: 'inherit' }}>
            <item.icon size={26} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
          </Link>
        ))}
      </div>

      {canManage && (
        <TemplateCoverage whatsappTemplates={whatsappTemplates} emailTemplates={emailTemplates}
          workspaces={templateWorkspaces} stagesByWorkspace={stagesByWorkspace} />
      )}
      {canManage && (
        <WhatsAppTemplatesPanel templates={whatsappTemplates} workspaces={templateWorkspaces}
          stagesByWorkspace={stagesByWorkspace} courses={templateCourses} />
      )}
      {canManage && (
        <EmailTemplatesPanel templates={emailTemplates} workspaces={templateWorkspaces}
          stagesByWorkspace={stagesByWorkspace} courses={templateCourses} />
      )}

      {canManage && <div style={{ ...card(), overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
          אינטגרציות
        </div>
        {[
          {
            label: 'טלפוניה (015)',
            desc: isClickToDialConfigured()
              ? 'קליטת שיחות נכנסות + הקלטות + חיוג-יזום מהמערכת'
              : 'קליטת שיחות נכנסות + הקלטות (חיוג-יזום דורש הגדרת HALLO015_API_USERNAME/HALLO015_API_PASSWORD)',
            configured: isHallo015Configured(),
          },
          { label: 'SMS', desc: 'שליחה ידנית ואוטומטית', configured: false },
          {
            label: 'WhatsApp (InforU)', desc: 'שליחה וקבלה של הודעות',
            configured: isInforuConfigured(),
            note: isInforuConfigured() && !isInforuWebhookConfigured()
              ? 'שליחה מחוברת, קליטת הודעות נכנסות עדיין לא (חסר INFORU_WEBHOOK_SECRET)'
              : null,
          },
          { label: 'קשר (סליקה וקבלות)', desc: 'תרומות, הוראות קבע, קבלות', configured: isKesherConfigured() },
        ].map((item) => (
          <div key={item.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 18px', borderBottom: '1px solid var(--bg-tertiary)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{item.desc}</div>
              {item.note && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>⚠ {item.note}</div>}
            </div>
            {item.configured ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ✓ מחובר
              </span>
            ) : (
              <NotConnectedButton label="חיבור" message={`חיבור ${item.label} — עדיין לא מחובר`} />
            )}
          </div>
        ))}
      </div>}
    </div>
  );
}
