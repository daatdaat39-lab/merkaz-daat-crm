// כללי שלב אוטומטיים ללידים במחלקות שמוכרות קורסים (workspaces.sells_courses).
// מקור יחיד לכללים, כדי שכל נתיב שמשייך נציג או מתחיל רישום יתנהג אותו דבר:
//   1. שיוך נציג לליד "ליד חדש"  <- השלב עובר ל"פתוח".
//   2. הסרת הנציג מליד "פתוח"      <- חוזר ל"ליד חדש" (רק אם השלב "פתוח" בדיוק).
//   3. שמירה מכוונת ראשונה במסך הרישום <- "בתהליך הרשמה", רק אם השלב מוקדם ממנו
//      בסדר ה-pipeline (אף פעם לא מורידים שלב).
// שינוי שלב ידני נשאר אפשרי תמיד. המפתחות (new_lead/open/registering) קיימים
// במיגרציות 0008/0036; לפני כל שינוי בודקים שהם באמת חלק מה-pipeline של המחלקה.
import { getPipeline } from './pipelines';
import { applyStageAutomations } from './stageAutomations';
import { STAGE_NEW_LEAD, STAGE_OPEN, STAGE_REGISTERING } from './leadStageKeys';

async function loadDepartment(supabase, departmentRowId) {
  const { data } = await supabase
    .from('contact_departments')
    .select('id, contact_id, workspace_id, stage, agent_id, workspaces:workspace_id (name, sells_courses)')
    .eq('id', departmentRowId)
    .maybeSingle();
  return data || null;
}

// עדכון שלב עם הגנה מפני מרוץ (עדכון רק אם השלב עדיין כמו שקראנו), ואחריו
// אוטומציות השלב. הסדר חשוב: כתיבת agent_id כבר בוצעה לפני הקריאה, כי האישור
// של האוטומציה נשלח לנציג המשויך.
export async function moveLeadStage(supabase, dept, targetStage, userId) {
  const { data: updated, error } = await supabase
    .from('contact_departments')
    .update({ stage: targetStage, last_activity_at: new Date().toISOString() })
    .eq('id', dept.id)
    .eq('stage', dept.stage)
    .select('id');
  if (error || !updated?.length) return false;
  await applyStageAutomations(supabase, {
    workspaceId: dept.workspace_id, stageKey: targetStage, contactId: dept.contact_id,
    userId, contactDepartmentId: dept.id,
  });
  return true;
}

// קוראים אחרי כתיבת agent_id (שיוך או הסרה). מחזיר { changed, stage }.
export async function applyAgentStageRule(supabase, departmentRowId, userId) {
  const dept = await loadDepartment(supabase, departmentRowId);
  if (!dept) return { changed: false, stage: null };
  const unchanged = { changed: false, stage: dept.stage };
  if (!dept.workspaces?.sells_courses) return unchanged;

  let target = null;
  if (dept.stage === STAGE_NEW_LEAD && dept.agent_id) target = STAGE_OPEN;
  else if (dept.stage === STAGE_OPEN && !dept.agent_id) target = STAGE_NEW_LEAD;
  if (!target) return unchanged;

  const pipeline = await getPipeline(supabase, dept.workspaces.name);
  if (!pipeline.order.includes(target)) return unchanged;

  const moved = await moveLeadStage(supabase, dept, target, userId);
  return moved ? { changed: true, stage: target } : unchanged;
}

// קוראים אחרי שמירה מכוונת במסך הרישום. idempotent: אם כבר בשלב הזה או מאוחר
// ממנו (או שהשלב לא שייך לרצף הרגיל, למשל "סגור") - לא עושים כלום.
export async function advanceToRegistering(supabase, departmentRowId, userId) {
  const dept = await loadDepartment(supabase, departmentRowId);
  if (!dept) return { changed: false, stage: null };
  const unchanged = { changed: false, stage: dept.stage };
  if (!dept.workspaces?.sells_courses) return unchanged;

  const pipeline = await getPipeline(supabase, dept.workspaces.name);
  const current = pipeline.order.indexOf(dept.stage);
  const target = pipeline.order.indexOf(STAGE_REGISTERING);
  if (current === -1 || target === -1 || current >= target) return unchanged;

  const moved = await moveLeadStage(supabase, dept, STAGE_REGISTERING, userId);
  return moved
    ? { changed: true, stage: STAGE_REGISTERING, stageLabel: pipeline.labels[STAGE_REGISTERING] || STAGE_REGISTERING }
    : unchanged;
}
