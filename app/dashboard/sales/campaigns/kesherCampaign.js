// מודול רגיל (בלי 'use server') - מקבל supabase כפרמטר בלי הנחת auth
// משלו, בדיוק כמו leadIntakeCore.js - כדי שיהיה ניתן לקרוא לו מתוך
// syncKesherReports (kesherSyncActions.js) שכבר עברה requireUser/
// requireManager משלה, בלי לגעת ב-actions.js הקיים (createCampaign/
// addContactsToCampaign שם דורשות session מחובר בעצמן).
const KESHER_CAMPAIGN_NAME = 'נכנס ממערכת קשר';

// מוצא (או יוצר בפעם הראשונה) את קמפיין "נכנס ממערכת קשר" של מחלקה,
// ורושם אליו איש קשר - הזרימה שתורם חדש שקשר מזהה עובר, במקום להיכנס
// ללוח הלידים הרגיל. שני שלבי ברירת המחדל (pending/done) זהים לאלה
// שכבר נזרעים ב-createCampaign (actions.js) - המנהל יכול לערוך אותם
// אחר כך במסך ניהול הקמפיינים הרגיל בדיוק כמו כל קמפיין אחר.
export async function enrollInKesherCampaign(supabase, workspaceId, contactId, userId) {
  let { data: campaign } = await supabase.from('campaigns')
    .select('id').eq('workspace_id', workspaceId).eq('name', KESHER_CAMPAIGN_NAME).maybeSingle();

  if (!campaign) {
    const { data: created } = await supabase.from('campaigns')
      .insert({ workspace_id: workspaceId, name: KESHER_CAMPAIGN_NAME, created_by: userId })
      .select('id').single();
    if (!created) return;
    campaign = created;
    await supabase.from('campaign_stages').insert([
      { campaign_id: campaign.id, stage_key: 'pending', label: 'ממתין', color_bg: '#fffbeb', color_fg: '#d97706', sort_order: 0 },
      { campaign_id: campaign.id, stage_key: 'done', label: 'טופל', color_bg: '#f0fdf4', color_fg: '#16a34a', sort_order: 1, is_won_stage: true },
    ]);
  }

  await supabase.from('campaign_contacts').upsert(
    { campaign_id: campaign.id, contact_id: contactId },
    { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true },
  );
}
