import { unstable_cache } from 'next/cache';
import { createAdminClient } from '../../../lib/supabase/admin';

// גרסה DB-backed של pipelines.js הישן - שולפת שלבים מ-pipeline_stages
// (מיגרציה 0036) במקום מהאובייקטים הקבועים PIPELINES/STAGE_LABELS/
// STAGE_COLORS. עריכת שלבים (הוספה/הסרה/שינוי תווית/צבע/דגלים) נעשית
// דרך הגדרות ← שלבי pipeline (settings/pipelines), לא דרך קוד.
const FALLBACK_PIPELINE = { order: [], leadStages: [], wonStage: null, sideStages: [], labels: {}, colors: {}, leadTabByStage: {} };

// שולף את כל השלבים של כל המחלקות בשאילתה אחת, ובונה גם מפה שטוחה
// (labels/colors) לצרכנים גלובליים שלא תלויים במחלקה ספציפית (למשל
// StageBadge ברשימת "כל אנשי הקשר"). אם שני workspaces יגדירו אי-פעם
// תווית שונה לאותו stage_key (לא קיים היום), המפה השטוחה תציג את הראשון
// שנמצא - סיכון ידוע ומקובל, ר' תוכנית הארכיטקטורה.
export async function getAllPipelines(supabase) {
  const { data: rows } = await supabase
    .from('pipeline_stages')
    .select('workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage, lead_tab, workspaces:workspace_id (name)')
    .order('sort_order', { ascending: true, nullsFirst: false });
  return shapePipelines(rows);
}

// גרסה-ממוטמנת (5 דק', אותו-דפוס-בדיוק כמו allContactTags.js) - להגדרות-
// pipeline-שכמעט-לא-משתנות, נקראות ב-layout.js (כל-ניווט!) ובעוד-5-
// מקומות. client-נפרד (admin, לא-מבוסס-cookies) כי unstable_cache אוסר
// cookies()/headers() בתוך-הפונקציה-הממוטמנת.
export const getAllPipelinesCached = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from('pipeline_stages')
      .select('workspace_id, stage_key, label, color_bg, color_fg, sort_order, is_lead_stage, is_won_stage, is_side_stage, lead_tab, workspaces:workspace_id (name)')
      .order('sort_order', { ascending: true, nullsFirst: false });
    return shapePipelines(rows);
  },
  ['all-pipelines'],
  { revalidate: 300 }
);

function shapePipelines(rows) {
  const byWorkspace = {};
  const labels = {};
  const colors = {};

  for (const r of rows || []) {
    const wsName = r.workspaces?.name;
    if (!wsName) continue;
    if (!byWorkspace[wsName]) {
      byWorkspace[wsName] = { order: [], leadStages: [], wonStage: null, sideStages: [], labels: {}, colors: {}, leadTabByStage: {} };
    }
    const p = byWorkspace[wsName];
    if (r.is_side_stage) p.sideStages.push(r.stage_key);
    else p.order.push(r.stage_key);
    if (r.is_lead_stage) p.leadStages.push(r.stage_key);
    if (r.is_won_stage) p.wonStage = r.stage_key;
    p.labels[r.stage_key] = r.label;
    p.colors[r.stage_key] = { bg: r.color_bg, color: r.color_fg };
    p.leadTabByStage[r.stage_key] = r.lead_tab || 'auto';

    if (!(r.stage_key in labels)) {
      labels[r.stage_key] = r.label;
      colors[r.stage_key] = { bg: r.color_bg, color: r.color_fg };
    }
  }

  return { byWorkspace, labels, colors };
}

export async function getPipeline(supabase, workspaceName) {
  const all = await getAllPipelines(supabase);
  return all.byWorkspace[workspaceName] || FALLBACK_PIPELINE;
}
