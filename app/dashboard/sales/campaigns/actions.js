'use server';

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../lib/contactGuards';

// קמפיין תרומות: קבוצת אנשי קשר שמטופלת יחד, מחולקת לקטגוריות (חם/קר/
// תורם גדול), משויכת לנציגים, עם ערוץ פעולה מוגדר (שיחה/וואטסאפ/מייל/
// פגישה). כל הפעולות כאן מוגבלות לבעלים/מנהל של המחלקה.

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireManager(supabase, userId, workspaceId) {
  const allowed = await isManagerOfWorkspace(supabase, userId, workspaceId);
  return allowed ? null : { error: 'רק בעלים/מנהל של המחלקה יכול לנהל קמפיינים' };
}

export async function createCampaign(workspaceId, name, channel) {
  const { supabase, user } = await requireUser();
  if (!workspaceId || !(name || '').trim()) return { error: 'יש למלא שם קמפיין' };

  const denied = await requireManager(supabase, user.id, workspaceId);
  if (denied) return denied;

  const { data, error } = await supabase.from('campaigns').insert({
    workspace_id: workspaceId,
    name: name.trim(),
    channel: channel || null,
    created_by: user.id,
  }).select('id').single();
  if (error) return { error: error.message };

  // זריעת שני שלבי ברירת המחדל (ר' migration 0039) - אותה התנהגות
  // בדיוק כמו הסטטוס הקבוע הישן, עד שמנהל בוחר להתאים אישית דרך
  // עמוד "שלבי הקמפיין". רק לקמפיינים רגילים (ברירת המחדל 'outreach') -
  // קמפיין הקדשות לא נוצר דרך הפונקציה הזו בכלל (ר' getOrCreateDedicationCampaign).
  await supabase.from('campaign_stages').insert([
    { campaign_id: data.id, stage_key: 'pending', label: 'ממתין', color_bg: '#fffbeb', color_fg: '#d97706', sort_order: 0 },
    { campaign_id: data.id, stage_key: 'done', label: 'טופל', color_bg: '#f0fdf4', color_fg: '#16a34a', sort_order: 1, is_won_stage: true },
  ]);

  return { success: true, id: data.id };
}

export async function addContactsToCampaign(campaignId, contactIds) {
  const { supabase, user } = await requireUser();
  if (!campaignId || !Array.isArray(contactIds) || contactIds.length === 0) {
    return { error: 'לא נבחרו אנשי קשר' };
  }

  const { data: campaign } = await supabase
    .from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const denied = await requireManager(supabase, user.id, campaign.workspace_id);
  if (denied) return denied;

  // ignoreDuplicates - הוספה חוזרת של אותו איש קשר לקמפיין לא יוצרת כפילות
  const { error } = await supabase.from('campaign_contacts').upsert(
    contactIds.map((contactId) => ({ campaign_id: campaignId, contact_id: contactId })),
    { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateCampaignContact(rowId, changes) {
  const { supabase, user } = await requireUser();
  if (!rowId) return { error: 'לא נבחרה שורה' };

  const { data: row } = await supabase
    .from('campaign_contacts').select('id, campaign_id, assigned_to, campaigns:campaign_id (workspace_id)').eq('id', rowId).single();
  if (!row) return { error: 'השורה לא נמצאה' };
  // נציג שהקמפיין הוקצה לו מותר לו לקדם שלב מכרטיס איש הקשר, לא רק מנהל -
  // בדיוק כמו updateDepartmentStage/updateLeadStage שאין להן guard מנהל
  // בכלל. עדכון category/assignedTo עדיין דורש מנהל (נשלטים דרך עמוד
  // הקמפיין המנוהל-מנהל בלבד).
  if (row.assigned_to !== user.id || changes.category !== undefined || changes.assignedTo !== undefined) {
    const denied = await requireManager(supabase, user.id, row.campaigns?.workspace_id);
    if (denied) return denied;
  }

  const update = {};
  if (changes.category !== undefined) update.category = changes.category || null;
  if (changes.assignedTo !== undefined) update.assigned_to = changes.assignedTo || null;
  if (changes.status !== undefined) {
    // מוודאים שהערך קיים בפועל כשלב של הקמפיין הזה - מונע "תקיעת" סטטוס
    // יתום אם שלב נמחק/שונה בכרטיסיה אחרת שנשארה פתוחה (campaign_stages
    // הוא free text, לא FK - ר' migration 0039)
    const { count } = await supabase.from('campaign_stages')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', row.campaign_id).eq('stage_key', changes.status);
    if (!count) return { error: 'השלב הזה כבר לא קיים בקמפיין - רענן את העמוד' };
    update.status = changes.status;
  }
  if (Object.keys(update).length === 0) return { success: true };

  const { error } = await supabase.from('campaign_contacts').update(update).eq('id', rowId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeContactFromCampaign(rowId) {
  const { supabase, user } = await requireUser();
  if (!rowId) return { error: 'לא נבחרה שורה' };

  const { data: row } = await supabase
    .from('campaign_contacts').select('id, campaigns:campaign_id (workspace_id)').eq('id', rowId).single();
  if (!row) return { error: 'השורה לא נמצאה' };
  const denied = await requireManager(supabase, user.id, row.campaigns?.workspace_id);
  if (denied) return denied;

  // הסרה מהקמפיין בלבד - איש הקשר עצמו וכל ההיסטוריה שלו נשארים
  const { error } = await supabase.from('campaign_contacts').delete().eq('id', rowId);
  if (error) return { error: error.message };
  return { success: true };
}
