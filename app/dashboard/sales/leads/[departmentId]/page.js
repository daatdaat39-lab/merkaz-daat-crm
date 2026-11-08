import { redirect } from 'next/navigation';
import { ensureLeadActionChip } from '../../../lib/aiActionChip';
import { ensureLeadTimelineSummary } from '../../../lib/timelineSummary';
import { loadLeadCoreContext } from './loadLeadCoreContext';
import LeadWorkScreen from './LeadWorkScreen';

// מסך-עבודה ייעודי לטיפול-בליד (שלב 3 ממודול מכירות/שירות) - route חדש
// לגמרי, לא הרחבה של המודאל הקיים של כרטיס-איש-הקשר. מפתח לפי
// contact_departments.id (לא contacts.id!) - כדי שהנעילה (migration 0148)
// תהיה לפי שיוך-מחלקה ספציפי, לא לפי איש-הקשר כולו.
export default async function LeadWorkPage({ params }) {
  const { departmentId } = params;
  const ctx = await loadLeadCoreContext(departmentId);

  if (ctx.redirectToLogin) redirect('/login');
  if (ctx.deptNotFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        הליד הזה לא נמצא.
      </div>
    );
  }
  if (ctx.noAccess) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        אין לך גישה לליד הזה.
      </div>
    );
  }
  if (ctx.contactNotFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        איש הקשר לא נמצא.
      </div>
    );
  }
  if (ctx.departmentNotFound) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px', fontSize: 13 }}>
        השיוך הזה לא נמצא יותר (אולי נמחק).
      </div>
    );
  }

  const { supabase, deptRow, department, props, courses, checklist, courseTracks, formFields, pipeline } = ctx;

  const [{ data: playbookItems }, { data: sendConnections }, { data: emailTemplates }] = await Promise.all([
    supabase.from('reference_content').select('id, course_id, tag, title, body').eq('kind', 'playbook').eq('is_active', true).order('sort_order'),
    supabase.from('email_connections').select('workspace_id, email_address').eq('purpose', 'send'),
    supabase.from('email_templates').select('id, name, subject, body').order('created_at'),
  ]);

  // צ'יפ-AI "מה-לעשות-עכשיו" - נוצר/מתרענן אוטומטית כאן אם stale (ר'
  // הטריגר ב-migration 0156), בלי להסתמך על cron. ברשימה (page.js של
  // הלוח) זה לא קורה בטעינה - שם מוצג רק הערך-השמור, ר' aiChipActions.js.
  const { actionText: aiActionText, confidence: aiConfidence } = await ensureLeadActionChip(supabase, {
    id: departmentId, stale: department.aiActionSummaryStale, cachedSummary: department.aiActionSummary,
    cachedConfidence: department.aiConfidence,
    contactName: `${props.contact.first} ${props.contact.last}`, courseId: department.courseId,
    communication: {
      inquiries: department.inquiries, meetings: props.meetings, tasks: props.tasks,
      sentEmails: props.sentEmails, sentWhatsapp: props.sentWhatsapp, callHistory: props.callHistory, phoneCalls: props.phoneCalls,
    },
  });

  // האם-זו-המחלקה-הזו-היא-הליד-היחיד-לאיש-הקשר-באותו-workspace - קובע
  // אם-פריטי-היסטוריה-ישנים-בלי-contact_department_id (מלפני migration
  // 0167) מותר-להציג-בציר-הזמן-של-הליד-הזה (ר' timelineProps למטה).
  const includeNullDept = props.departments.filter((d) => d.workspaceId === deptRow.workspace_id).length <= 1;

  // סיכום-ציר-זמן קצר ("מה קרה עד עכשיו") - קאש לפי מספר-הפריטים-הכולל
  // (ר' lib/timelineSummary.js), לא ע"י stale/טריגר - אותם 7 מערכים
  // שכבר נטענו-ממילא עבור UnifiedTimeline, בלי שאילתה נוספת.
  const timelineItemCount = props.allInquiries.length + props.sentEmails.length + props.sentWhatsapp.length
    + props.donationTransactions.length + props.callHistory.length + props.phoneCalls.length + props.meetings.length;
  const timelineSummary = await ensureLeadTimelineSummary(supabase, {
    id: departmentId, cachedSummary: department.aiTimelineSummary, cachedItemCount: department.aiTimelineSummaryItemCount,
    currentItemCount: timelineItemCount, contactName: `${props.contact.first} ${props.contact.last}`,
    communication: {
      inquiries: department.inquiries, meetings: props.meetings, tasks: props.tasks,
      sentEmails: props.sentEmails, sentWhatsapp: props.sentWhatsapp, callHistory: props.callHistory, phoneCalls: props.phoneCalls,
    },
  });

  return (
    <LeadWorkScreen
      departmentId={departmentId}
      aiActionText={aiActionText}
      aiConfidence={aiConfidence}
      timelineSummary={timelineSummary}
      contact={{
        id: props.contact.id, first: props.contact.first, last: props.contact.last,
        phone: props.contact.phone, phone2: props.contact.phone2, email: props.contact.email,
        city: props.contact.city, idnum: props.contact.idnum, birth_date: props.contact.birth_date, occupation: props.contact.occupation,
        street: props.contact.street, house_number: props.contact.house_number, neighborhood: props.contact.neighborhood, zip_code: props.contact.zip_code,
      }}
      department={department}
      stageLabel={pipeline.labels[department.stage] || department.stage}
      wonStage={pipeline.wonStage || null}
      wonStageLabel={pipeline.wonStage ? (pipeline.labels[pipeline.wonStage] || pipeline.wonStage) : null}
      stages={[...pipeline.order, ...pipeline.sideStages]}
      stageLabels={pipeline.labels}
      workspaceId={deptRow.workspace_id}
      workspaceName={deptRow.workspaces?.name}
      courses={courses}
      checklist={checklist}
      courseTracks={courseTracks}
      formFields={formFields}
      playbookItems={playbookItems || []}
      whatsappTemplates={props.whatsappTemplates}
      emailTemplates={emailTemplates || []}
      sendConnections={sendConnections || []}
      agents={props.agentsByWorkspace?.[deptRow.workspace_id] || []}
      timelineProps={{
        // "חוקת-הליד" - רק-פעילות-ששייכת-ל-ליד-הספציפי-הזה (לא-כל-
        // המחלקה, ולא-היסטוריה-שלא-הייתה-מתוך-הכרטיס-של-הליד-הזה).
        // פניות/מייל/וואטסאפ/פגישה מסוננים-לפי contact_department_id
        // (lead_inquiries - תמיד-היה-קיים; מייל/וואטסאפ/פגישה - עמודה
        // חדשה, migration 0167). תיקון-מכוון (לא-היה-כך-במקור): פריטי-
        // מייל/וואטסאפ/פגישה-היסטוריים-בלי-שיוך (null, מלפני-המיגרציה)
        // מוצגים-בכל-זאת **רק-אם-זו-המחלקה-הזו-היא-הליד-היחיד** שלה
        // לאיש-הקשר (אין-שום-ליד-מתחרה-שהם-יכלו-להשתייך-אליו-בטעות) -
        // כדי-שלא-"תיעלם" היסטוריה-ישנה-ולגיטימית-לרוב-הלידים (שאין-להם-
        // בכלל-כמה-קורסים). כש-יש-כמה-לידים-פתוחים/היסטוריים-באותה-
        // מחלקה - נשארים-מוסתרים (יש-שם-אי-ודאות-אמיתית-לפתור).
        // תיקון-נוסף (נמצא-בבדיקה-חיה): תרומות/שיחות-טלפון **כן-יכולות**-
        // להיות-מסוננות-לפי-מחלקה - תרומות תמיד-שייכות-ל"תרומות"-בלבד
        // (workspace_id אמיתי, לא-ambiguous) - הצגתן-במלואן (כולל-עשרות-
        // תנועות-היסטוריות-ממחלקה-אחרת-לגמרי) בתוך-ליד-של-"דעת ותבונה"
        // הייתה-טעות-הסקה-מההחלטה-המקורית, לא-כוונה. שיחות-טלפון קיבלו
        // workspace_id אמיתי (migration 0167 + item-8) רק-לשיחות-חדשות -
        // אותו-עיקרון-includeNullDept כמו-מייל/וואטסאפ/פגישה לשיחות-ישנות.
        // callHistory (ייבוא-היסטורי) נשארת-גלובלית - באמת-אין-לה-workspace_id בכלל.
        inquiries: props.allInquiries.filter((i) => i.contactDepartmentId === departmentId),
        sentEmails: props.sentEmails.filter((e) => e.contact_department_id === departmentId
          || (includeNullDept && e.contact_department_id == null && e.workspace_id === deptRow.workspace_id)),
        sentWhatsapp: props.sentWhatsapp.filter((w) => w.contact_department_id === departmentId
          || (includeNullDept && w.contact_department_id == null && w.workspace_id === deptRow.workspace_id)),
        donationTransactions: props.donationTransactions.filter((t) => t.workspace_id === deptRow.workspace_id),
        callHistory: props.callHistory,
        phoneCalls: props.phoneCalls.filter((c) => c.workspace_id === deptRow.workspace_id
          || (includeNullDept && c.workspace_id == null)),
        meetings: props.meetings.filter((m) => m.contact_department_id === departmentId
          || (includeNullDept && m.contact_department_id == null && m.workspace_id === deptRow.workspace_id)),
        workspaceNameById: props.workspaceNameById,
        isManager: props.isManager,
        viewerExtension: props.viewerExtension,
      }}
    />
  );
}
