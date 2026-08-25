'use server';

import { createClient } from '../../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../../lib/contactGuards';

// שלבי קמפיין הם נתון משותף לכל מי שעובד על הקמפיין (בניגוד להעדפות
// שדות אישיות ב-lib/fieldPreferences.js) - לכן דורשים owner/admin של
// המחלקה, אותו דפוס requireManager בדיוק כמו settings/pipelines/actions.js
// וגם campaigns/actions.js.
async function requireManager(campaignId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign } = await supabase.from('campaigns').select('workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };

  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) return { error: 'רק owner/admin של המחלקה יכול לערוך שלבי קמפיין' };
  return { supabase, workspaceId: campaign.workspace_id };
}

// stage_key לא ניתן לעריכה אחרי יצירה (immutable) - campaign_contacts.status
// הוא טקסט חופשי, לא FK, אז שינוי מפתח קיים יתמך שיוכים קיימים. ייחודיות
// per-campaign (unique(campaign_id, stage_key)).
export async function createCampaignStage(campaignId, { stageKey, label, colorBg, colorFg }) {
  const ctx = await requireManager(campaignId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const key = (stageKey || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const lbl = (label || '').trim();
  if (!key || !lbl) return { error: 'יש להזין מפתח טכני ותווית' };

  const { count } = await supabase.from('campaign_stages')
    .select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId);

  const { error } = await supabase.from('campaign_stages').insert({
    campaign_id: campaignId,
    stage_key: key,
    label: lbl,
    color_bg: colorBg || '#f4f4f5',
    color_fg: colorFg || '#52525b',
    sort_order: count || 0,
  });
  if (error) return { error: error.code === '23505' ? 'מפתח זה כבר קיים בקמפיין זה' : error.message };
  return { success: true };
}

export async function updateCampaignStage(id, campaignId, { label, colorBg, colorFg }) {
  const ctx = await requireManager(campaignId);
  if (ctx.error) return ctx;
  const lbl = (label || '').trim();
  if (!lbl) return { error: 'יש להזין תווית' };

  const { error } = await ctx.supabase.from('campaign_stages').update({
    label: lbl, color_bg: colorBg || '#f4f4f5', color_fg: colorFg || '#52525b',
  }).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// מנקה את הדגל משורות אחרות של אותו קמפיין - שלב-ניצחון יחיד לכל קמפיין
export async function setCampaignWonStage(campaignId, stageId) {
  const ctx = await requireManager(campaignId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  await supabase.from('campaign_stages').update({ is_won_stage: false }).eq('campaign_id', campaignId);
  const { error } = await supabase.from('campaign_stages').update({ is_won_stage: true }).eq('id', stageId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function reorderCampaignStages(campaignId, orderedIds) {
  const ctx = await requireManager(campaignId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from('campaign_stages').update({ sort_order: i }).eq('id', orderedIds[i]);
  }
  return { success: true };
}

// חוסם מחיקה אם יש שיוכי-חברות בפועל עם הסטטוס הזה (campaign_contacts.status
// הוא טקסט חופשי, אז זו הבדיקה האפליקטיבית היחידה מפני יתמות)
export async function deleteCampaignStage(id, campaignId, stageKey) {
  const ctx = await requireManager(campaignId);
  if (ctx.error) return ctx;
  const { supabase } = ctx;

  const { count } = await supabase.from('campaign_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('status', stageKey);
  if ((count || 0) > 0) return { error: `לא ניתן למחוק - ${count} אנשי קשר נמצאים כרגע בשלב הזה` };

  const { error } = await supabase.from('campaign_stages').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}
