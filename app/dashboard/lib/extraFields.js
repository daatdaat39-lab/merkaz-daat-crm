// גרסה DB-backed של EXTRA_FIELDS (שהיה עד כה אובייקט JS קבוע ב-
// components/pipelines.js) - אותו דפוס בדיוק כמו lib/pipelines.js
// (getAllPipelines/getPipeline מבוססי pipeline_stages). ה-fallback
// הקבוע ב-components/pipelines.js נשאר קיים למקרה קצה של מחלקה בלי
// שורות בטבלה - לא נמחק.
import { getExtraFields as getExtraFieldsFallback } from '../components/pipelines';

// שדות-קורסים-חופשיים-ישנים במחלקת "דעת ותבונה" בלבד - הוחלפו ע"י
// course_purchases (קטלוג אמיתי) + CoursePurchasesPanel. מוחרגים
// מתצוגת-הטופס-הרגילה (ContactTabs.js/GenericStatsTile.js) - שימו לב
// ש-study_track/initial_payment_stage קיימים גם כשדות-אמיתיים-נפרדים
// במחלקת "דעת למדני" (EXTRA_FIELDS ב-components/pipelines.js) - ההחרגה
// חייבת להיות מוגבלת ל-workspaceName==='דעת ותבונה', לא גלובלית לפי key.
// learner_status/payment_status כלולים כאן למרות שהם לא-עצמם-שדה-קורס:
// הם שדות-מחושבים שהנוסחה שלהם (ב-DB) קוראת בדיוק את current_course/
// initial_payment_stage - בלי הטופס-להזנתם הם יישארו קפואים-לנצח על
// הערך-ההיסטורי-האחרון, אז מיותרים באותה מידה. seniority_in_system
// (מחושב מ-orbit_registration_date, שדה-אורביט נפרד) לא קשור ונשאר.
export const LEGACY_COURSE_FIELD_KEYS = [
  'study_track', 'initial_payment_stage', 'current_course',
  'graduate_of', 'graduation_year', 'short_course_purchased', 'short_courses_summary',
  'learner_status', 'payment_status',
];

export async function getAllExtraFields(supabase) {
  const { data: rows } = await supabase
    .from('workspace_extra_fields')
    .select('workspace_id, field_key, label, type, options, sort_order, visible_to_agents, allow_multiple, workspaces:workspace_id (name)')
    .order('sort_order', { ascending: true });

  const byWorkspaceName = {};
  for (const r of rows || []) {
    const wsName = r.workspaces?.name;
    if (!wsName) continue;
    if (!byWorkspaceName[wsName]) byWorkspaceName[wsName] = [];
    byWorkspaceName[wsName].push({ key: r.field_key, label: r.label, type: r.type, options: r.options || [], visibleToAgents: r.visible_to_agents !== false, allowMultiple: !!r.allow_multiple });
  }
  return byWorkspaceName;
}

export async function getExtraFields(supabase, workspaceName) {
  const all = await getAllExtraFields(supabase);
  return all[workspaceName] || getExtraFieldsFallback(workspaceName);
}
