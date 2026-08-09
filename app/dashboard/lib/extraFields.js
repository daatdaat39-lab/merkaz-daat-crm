// גרסה DB-backed של EXTRA_FIELDS (שהיה עד כה אובייקט JS קבוע ב-
// components/pipelines.js) - אותו דפוס בדיוק כמו lib/pipelines.js
// (getAllPipelines/getPipeline מבוססי pipeline_stages). ה-fallback
// הקבוע ב-components/pipelines.js נשאר קיים למקרה קצה של מחלקה בלי
// שורות בטבלה - לא נמחק.
import { getExtraFields as getExtraFieldsFallback } from '../components/pipelines';

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
