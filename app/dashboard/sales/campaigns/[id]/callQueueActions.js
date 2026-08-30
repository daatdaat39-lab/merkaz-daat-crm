'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { fetchDistinctCampaignCategories, getSegmentRowInsights } from '../actions';

// תור-שיחות לטלמרקטינג: בניגוד ל-actions.js (מנהל בלבד), הפעולות כאן
// פתוחות לכל חבר-מחלקה - כל מי שעובד על הקמפיין צריך גישה לתור, לא רק
// owner/admin. ר' migrations/0092_campaign_call_queue.sql לסכימה/ה-RPC.

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function requireMemberOfCampaign(supabase, userId, campaignId) {
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const allowed = await isMemberOfWorkspace(supabase, userId, campaign.workspace_id);
  if (!allowed) return { error: 'אין לך גישה לקמפיין הזה' };
  return { campaign };
}

export async function getCallableCampaignSummary(campaignId) {
  const { supabase, user } = await requireUser();
  const { campaign, error } = await requireMemberOfCampaign(supabase, user.id, campaignId);
  if (error) return { error };

  const [categories, { data: counts, error: countsError }] = await Promise.all([
    fetchDistinctCampaignCategories(supabase, campaignId),
    supabase.rpc('count_callable_campaign_contacts_by_category', { p_campaign_id: campaignId, p_caller: user.id }),
  ]);
  if (countsError) return { error: countsError.message };

  const countByCategory = Object.fromEntries((counts || []).map((r) => [r.category || '(ללא קטגוריה)', r.callable_count]));
  const total = (counts || []).reduce((s, r) => s + Number(r.callable_count || 0), 0);
  return { success: true, campaignName: campaign.name, categories, countByCategory, total };
}

// טבלת-עיון בלבד (לא אינטראקטיבית) - שקיפות "מי תופס מה עכשיו", לא כלי
// עריכה (עריכת שורה שייכת למסך הניהול של המנהל, [id]/page.js).
export async function listCategoryContactsForCalling(campaignId, category) {
  const { supabase, user } = await requireUser();
  const { error } = await requireMemberOfCampaign(supabase, user.id, campaignId);
  if (error) return { error };

  let query = supabase.from('campaign_contacts')
    .select('id, status, claimed_by, claimed_at, contacts:contact_id (first, last, phone)')
    .eq('campaign_id', campaignId).order('id').limit(200);
  if (category) query = query.eq('category', category);
  const { data, error: queryError } = await query;
  if (queryError) return { error: queryError.message };

  const claimerIds = Array.from(new Set((data || []).map((r) => r.claimed_by).filter(Boolean)));
  const { data: profiles } = claimerIds.length
    ? await supabase.from('profiles').select('id, name').in('id', claimerIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));

  const rows = (data || []).filter((r) => r.contacts).map((r) => ({
    rowId: r.id, status: r.status,
    name: `${r.contacts.first || ''} ${r.contacts.last || ''}`.trim(), phone: r.contacts.phone || '',
    claimedByName: r.claimed_by ? (nameById[r.claimed_by] || 'נציג') : null,
  }));
  return { success: true, rows };
}

export async function claimNextContact(campaignId, category) {
  const { supabase, user } = await requireUser();
  const { error } = await requireMemberOfCampaign(supabase, user.id, campaignId);
  if (error) return { error };

  const { data, error: rpcError } = await supabase.rpc('claim_next_campaign_contact', {
    p_campaign_id: campaignId, p_caller: user.id, p_category: category || null,
  });
  if (rpcError) return { error: rpcError.message };
  const row = (data || [])[0];
  if (!row) return { success: true, contact: null };

  const insights = await getSegmentRowInsights(row.contact_id);
  return {
    success: true,
    contact: {
      rowId: row.row_id, contactId: row.contact_id, category: row.category, status: row.status, note: row.note || '',
      name: `${row.first || ''} ${row.last || ''}`.trim(), phone: row.phone, phone2: row.phone2, email: row.email,
      relatedContactId: row.related_contact_id, relationLabel: row.relation_label,
      spouse: row.related_contact_id ? {
        rowId: row.spouse_row_id, status: row.spouse_status, claimedBy: row.spouse_claimed_by,
      } : null,
      insights,
    },
  };
}

export async function logCallOutcomeAndAdvance(rowId, { newStatus, note }) {
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase.from('campaign_contacts').select('id, campaign_id, note, claimed_by').eq('id', rowId).maybeSingle();
  if (!row) return { error: 'איש הקשר לא נמצא' };
  const { error } = await requireMemberOfCampaign(supabase, user.id, row.campaign_id);
  if (error) return { error };
  if (row.claimed_by !== user.id) return { error: 'איש הקשר הזה כבר לא נעול אצלך - כנראה שהתפיסה פגה' };

  const { data: validStages } = await supabase.from('campaign_stages').select('stage_key').eq('campaign_id', row.campaign_id);
  const validStageKeys = new Set((validStages || []).map((s) => s.stage_key));
  const update = { claimed_by: null, claimed_at: null };
  if (newStatus !== undefined && validStageKeys.has(newStatus)) update.status = newStatus;
  if (note && note.trim()) {
    const stamp = `[${new Date().toLocaleString('he-IL')}] ${note.trim()}`;
    update.note = row.note ? `${stamp}\n\n${row.note}` : stamp;
  }

  const { error: updateError } = await supabase.from('campaign_contacts').update(update).eq('id', rowId);
  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function skipContact(rowId) {
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase.from('campaign_contacts').select('id, campaign_id').eq('id', rowId).maybeSingle();
  if (!row) return { error: 'איש הקשר לא נמצא' };
  const { error } = await requireMemberOfCampaign(supabase, user.id, row.campaign_id);
  if (error) return { error };

  const { error: rpcError } = await supabase.rpc('release_campaign_contact_claim', { p_row_id: rowId, p_caller: user.id });
  if (rpcError) return { error: rpcError.message };
  return { success: true };
}
