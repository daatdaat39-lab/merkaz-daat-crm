// שלבים דינמיים לכל קמפיין בנפרד (טבלת campaign_stages, מיגרציה 0039) -
// עותק מפושט של app/dashboard/lib/pipelines.js, הפעם per-campaign_id
// במקום per-workspace_id. לא רלוונטי לקמפייני הקדשות (kind='dedication') -
// אלה פשוט לא מקבלים שורות ב-campaign_stages כלל.
export async function getCampaignStages(supabase, campaignId) {
  const { data: rows } = await supabase
    .from('campaign_stages')
    .select('stage_key, label, color_bg, color_fg, sort_order, is_won_stage')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true, nullsFirst: false });

  const order = [];
  const labels = {};
  const colors = {};
  let wonStage = null;
  for (const r of rows || []) {
    order.push(r.stage_key);
    labels[r.stage_key] = r.label;
    colors[r.stage_key] = { bg: r.color_bg, color: r.color_fg };
    if (r.is_won_stage) wonStage = r.stage_key;
  }
  return { order, wonStage, labels, colors };
}
