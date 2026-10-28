import Link from 'next/link';
import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { getExtraFields } from '../../lib/extraFields';
import { getPipeline } from '../../lib/pipelines';
import { getPicklistValues } from '../../lib/picklists';
import AddContactForm from '../../contacts/AddContactForm';
import LeadsBoard from './LeadsBoard';
import AdvancedInquiriesBanner from './AdvancedInquiriesBanner';
import { groupTagsByDepartment } from '../../lib/tagGroups';
import { isManagerOfWorkspace } from '../../lib/contactGuards';
import { getAllContactTagRows } from '../../lib/allContactTags';
import { WarningIcon } from '../../components/icons';

const RECENT_INQUIRY_DAYS = 3;

export default async function SalesLeadsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('current_workspace_id, workspaces:current_workspace_id (name)')
    .eq('id', user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;
  const workspaceName = profile?.workspaces?.name;
  const pipeline = await getPipeline(supabase, workspaceName);
  const extraFields = await getExtraFields(supabase, workspaceName);
  const closeReasonRows = await getPicklistValues(supabase, 'close_reason', null);
  const closeReasons = closeReasonRows.length ? closeReasonRows.map((r) => r.value) : undefined;

  let leads = [];
  let agents = [];
  let existingElsewhereIds = new Set();
  let advancedInquiries = [];
  if (workspaceId) {
    // טוענים את כל השלבים (לא רק leadStages) - הלשוניות ב-LeadsBoard
    // (פתוחים/בתהליך/הצליחו/נפלו) מסננות בצד לקוח, כמו contacts/page.js
    const { data } = await supabase
      .from('contact_departments')
      .select('id, stage, agent_id, last_activity_at, extra_fields, created_by_manager, ai_action_summary, ai_action_summary_stale, rep_confidence, ai_confidence, course_id, courses:course_id (id, name), contacts:contact_id (id, first, last, phone, email, source, dept, tags, frozen), lead_inquiries (reason, created_at)')
      .eq('workspace_id', workspaceId)
      // לידים שממתינים לאישור המנהל לא מוצגים לנציגים - ר' sales/pending
      .eq('approval_status', 'approved')
      // אנשי קשר שיובאו בלי "פתיחת תהליך" (ר' DepartmentImportWizard.js) -
      // לא מופיעים כאן בכלל, רק דרך חיפוש אנשי קשר/הכרטיס האישי.
      .eq('opened_process', true)
      .order('last_activity_at', { ascending: false });
    leads = (data || [])
      .filter((row) => row.contacts)
      .map((row) => {
        const inquiries = [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        // lead.id הוא מזהה-שורת-המחלקה (לא מזהה-איש-הקשר!) - איש-קשר
        // יכול-להיות-בעל-כמה-שורות-באותה-מחלקה (ליד-לכל-קורס, ר' course_id
        // migration 0164), ו-id-משותף היה-גורם-למפתחות-כפולים/בחירה-
        // משותפת/שיוך-נציג-שפוגע-בשתי-השורות-בטעות. contactId נפרד
        // לפעולות-שבאמת-צריכות-את-איש-הקשר (קישור-לכרטיס, תגיות, שיחה/מייל).
        return {
          ...row.contacts,
          id: row.id, contactId: row.contacts.id, departmentRowId: row.id,
          stage: row.stage, agent_id: row.agent_id, last_activity_at: row.last_activity_at,
          extra_fields: row.extra_fields || {},
          courseId: row.course_id || null, courseName: row.courses?.name || null,
          createdByManager: !!row.created_by_manager,
          latestReason: inquiries[0]?.reason || null,
          inquiryCount: inquiries.length,
          aiActionSummary: row.ai_action_summary || null,
          aiActionSummaryStale: row.ai_action_summary_stale !== false,
          repConfidence: row.rep_confidence || null,
          aiConfidence: row.ai_confidence || null,
        };
      });

    // אין קשר-מפתח (FK) בין workspace_members ל-profiles במסד, אז לא ניתן
    // לבקש join מקונן אחד ישיר (profiles חוזר ריק תמיד) - שולפים בשתי שאילתות
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);
    const memberIds = (members || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from('profiles').select('id, name').in('id', memberIds)
      : { data: [] };
    agents = (memberProfiles || []).map((p) => ({ id: p.id, name: p.name || 'משתמש' }));

    // "איש קשר קיים" - האם הליד הזה כבר משויך גם למחלקה אחרת (לא רק זו),
    // כדי שנציג ידע שזה לא אדם זר לגמרי אלא מישהו שכבר מוכר למערכת
    if (leads.length) {
      const { data: otherDeptRows } = await supabase
        .from('contact_departments')
        .select('contact_id, workspace_id')
        .in('contact_id', leads.map((l) => l.contactId))
        .neq('workspace_id', workspaceId);
      existingElsewhereIds = new Set((otherDeptRows || []).map((r) => r.contact_id));
      leads = leads.map((l) => ({ ...l, existingElsewhere: existingElsewhereIds.has(l.contactId) }));
    }

    // פניות חדשות מאנשי קשר שכבר התקדמו מעבר לשלבי הליד המוקדמים (למשל
    // "תלמיד פעיל"/"בוגר"/"תורם פעיל") באותה מחלקה - אלה לא מופיעים
    // ברשימת הלידים הרגילה (מסוננת לפי leadStages בלבד), אבל פנייה חדשה
    // מהם עדיין ראויה לתשומת לב, בלי לשנות את השלב המתקדם שלהם.
    const nonLeadStages = pipeline.order.filter((s) => !pipeline.leadStages.includes(s));
    const recentCutoff = new Date(Date.now() - RECENT_INQUIRY_DAYS * 86400000).toISOString();
    const { data: advancedRows } = await supabase
      .from('contact_departments')
      .select('id, stage, contacts:contact_id (id, first, last), lead_inquiries!inner (id, reason, note, created_at, dismissed_at)')
      .eq('workspace_id', workspaceId)
      .in('stage', nonLeadStages)
      .gte('lead_inquiries.created_at', recentCutoff)
      .is('lead_inquiries.dismissed_at', null);
    advancedInquiries = (advancedRows || [])
      .filter((row) => row.contacts)
      .map((row) => {
        const latest = [...(row.lead_inquiries || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return { contactId: row.contacts.id, name: `${row.contacts.first} ${row.contacts.last}`, stage: row.stage, reason: latest?.reason, createdAt: latest?.created_at, inquiryId: latest?.id };
      })
      .filter((a) => a.inquiryId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // רשימת התגיות נשלפת ממטמון משותף (5 דקות, ר' lib/allContactTags.js)
  // במקום לסרוק מחדש את כל 6,500+ אנשי הקשר בכל טעינת עמוד.
  const [{ data: workspaces }, tagRows, { data: sendConnections }, { data: whatsappTemplates }, { data: emailTemplates }] = await Promise.all([
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    getAllContactTagRows(),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('whatsapp_templates').select('id, name, template_id, preview_text').order('sort_order').order('created_at'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
  ]);
  const existingTags = Array.from(new Set((tagRows || []).flatMap((c) => c.tags || []))).sort();
  const tagGroups = groupTagsByDepartment(
    (tagRows || []).map((c) => ({ tags: c.tags, departments: (c.contact_departments || []).map((d) => ({ name: d.workspaces?.name })) }))
  );

  const overdueCount = leads.filter((l) => pipeline.leadStages.includes(l.stage) && l.last_activity_at && (Date.now() - new Date(l.last_activity_at).getTime()) / 3600000 >= 24).length;

  // מונה לידים ממתינים לאישור - הקישור לתיבה מוצג רק לבעלים/מנהל המחלקה
  const isManager = workspaceId ? await isManagerOfWorkspace(supabase, user.id, workspaceId) : false;
  let pendingCount = 0;
  if (isManager && workspaceId) {
    const { count } = await supabase
      .from('contact_departments')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('approval_status', 'pending');
    pendingCount = count || 0;
  }


  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 24px', background: 'var(--k-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--k-text-muted)' }}>מכירות</div>
          <h1 style={{ fontFamily: 'var(--k-font-display)', margin: '4px 0 0', fontSize: 30, color: 'var(--k-text)' }}>לידים</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--k-text-muted)', fontSize: 12.5 }}>
            {leads.filter((l) => pipeline.leadStages.includes(l.stage)).length} לידים פתוחים, מחולקים לתת-קטגוריות
            {overdueCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--k-danger-text)', fontWeight: 600 }}> · <WarningIcon size={12} /> {overdueCount} לידים ללא טיפול מעל 24 שעות</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isManager && (
            <Link href="/dashboard/sales/campaigns" style={{
              background: 'var(--k-surface)', color: 'var(--k-text)', border: '1px solid var(--k-border)', textDecoration: 'none',
              fontSize: 13, padding: '8px 16px', borderRadius: 100,
            }}>
              🎯 קמפיינים
            </Link>
          )}
          {isManager && pendingCount > 0 && (
            <Link href="/dashboard/sales/pending" style={{
              background: 'var(--k-caution-bg)', color: 'var(--k-caution-text)', border: 'none', textDecoration: 'none',
              fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 100,
            }}>
              📥 {pendingCount} ממתינים לאישורך
            </Link>
          )}
          <AddContactForm
            label="+ צור ליד חדש" modalTitle="ליד חדש"
            workspaces={workspaces || []} defaultWorkspaceId={workspaceId || ''} existingTags={existingTags} tagGroups={tagGroups}
          />
        </div>
      </div>

      {advancedInquiries.length > 0 && (
        <AdvancedInquiriesBanner
          advancedInquiries={advancedInquiries.map((a) => ({ ...a, stageLabel: pipeline.labels[a.stage] || a.stage }))}
          stagesSummary={advancedInquiries.map((a) => pipeline.labels[a.stage] || a.stage).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')}
        />
      )}

      {leads.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>אין לידים פתוחים כרגע</div>
      ) : (
        <LeadsBoard
          leads={leads} agents={agents} workspaceId={workspaceId} workspaceName={workspaceName}
          stages={pipeline.order} sideStages={pipeline.sideStages} stageLabels={pipeline.labels} stageColors={pipeline.colors}
          leadStages={pipeline.leadStages} wonStage={pipeline.wonStage} leadTabByStage={pipeline.leadTabByStage}
          sendConnections={sendConnections || []} whatsappTemplates={whatsappTemplates || []}
          emailTemplates={emailTemplates || []}
          extraFields={isManager ? extraFields : extraFields.filter((f) => f.visibleToAgents !== false)}
          closeReasons={closeReasons}
          allTags={existingTags}
          tagGroups={tagGroups}
        />
      )}
    </div>
  );
}
