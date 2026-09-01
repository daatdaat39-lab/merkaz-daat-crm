'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isManagerOfWorkspace } from '../../../lib/contactGuards';
import { formatIsraeliDateTime } from '../../../lib/dateFormat';

const OUTCOME_LABELS = {
  no_answer: 'לא ענה',
  donating_now: 'תורם עכשיו תוך כדי הטלפון',
  requested_link: 'ביקש קישור לתרום בעצמו',
  not_interested: 'לא מעוניין לתרום',
  call_back: 'ביקש להתקשר מאוחר יותר',
};

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// כל האגרגציה הכבדה (סה"כ/פילוח-לפי-נציג) קורית ב-SQL (migration 0098) -
// לא נשלפות כאן שורות ניסיון גולמיות בשביל לחשב ב-JS, אפילו על קמפיין
// עם 6,000+ אנשי קשר ואלפי ניסיונות.
export async function getCallDashboardStats(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('id, name, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) return { error: 'רק מנהל יכול לראות דשבורד זה' };

  const [{ data: totalsRows }, { data: statsRows }, { data: notesRows }, { data: callbackRows }, { data: sessionEvents }, { data: claimedRows }] = await Promise.all([
    supabase.rpc('get_call_dashboard_totals', { p_campaign_id: campaignId }),
    supabase.rpc('count_call_attempts_stats', { p_campaign_id: campaignId }),
    supabase.from('campaign_call_attempts')
      .select('id, agent_id, outcome, note, note_type, created_at, campaign_contacts:campaign_contact_id!inner (campaign_id, contacts:contact_id (first, last))')
      .eq('campaign_contacts.campaign_id', campaignId)
      .not('note', 'is', null).neq('note', '')
      .order('created_at', { ascending: false }).limit(50),
    supabase.rpc('get_pending_callbacks', { p_campaign_id: campaignId }),
    supabase.from('call_session_events').select('agent_id, event_type, created_at').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
    // "מי תופס מה עכשיו" (0123) - תלוי ב-heartbeat (0119) ששומר claimed_at
    // אמיתי כל עוד הכרטיס עוד פתוח בפועל, אחרת תפיסה ישנה-אבל-לא-פגה
    // הייתה נראית כאן כאילו הנציג עדיין על הקו.
    supabase.rpc('get_currently_claimed_campaign_contacts', { p_campaign_id: campaignId }),
  ]);

  const totals = (totalsRows || [])[0] || { total_attempts: 0, unique_contacts_attempted: 0, remaining_in_queue: 0 };

  const agentIds = Array.from(new Set([
    ...(statsRows || []).map((r) => r.agent_id),
    ...(callbackRows || []).map((r) => r.scheduled_by),
    ...(sessionEvents || []).map((r) => r.agent_id),
    ...(claimedRows || []).map((r) => r.claimed_by),
  ].filter(Boolean)));
  const { data: profiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));

  const byAgent = {};
  for (const row of statsRows || []) {
    const agentName = row.agent_id ? (nameById[row.agent_id] || 'נציג') : 'לא ידוע';
    if (!byAgent[agentName]) byAgent[agentName] = { agentName, agentId: row.agent_id || null, total: 0, outcomes: {} };
    byAgent[agentName].outcomes[row.outcome] = (byAgent[agentName].outcomes[row.outcome] || 0) + Number(row.attempt_count);
    byAgent[agentName].total += Number(row.attempt_count);
  }
  const agentTable = Object.values(byAgent)
    .map((a) => ({
      ...a,
      outcomeBreakdown: Object.entries(a.outcomes).map(([outcome, count]) => ({
        outcome, label: OUTCOME_LABELS[outcome] || outcome, count, pct: a.total ? Math.round((count / a.total) * 100) : 0,
      })),
    }))
    .sort((a, b) => b.total - a.total);

  const currentlyClaimed = (claimedRows || []).map((r) => ({
    rowId: r.row_id, contactId: r.contact_id, name: `${r.first || ''} ${r.last || ''}`.trim(), phone: r.phone,
    agentName: r.claimed_by ? (nameById[r.claimed_by] || 'נציג') : 'נציג', claimedAt: formatIsraeliDateTime(r.claimed_at),
  }));

  const notes = (notesRows || [])
    .map((r) => ({
      id: r.id, agentName: r.agent_id ? (nameById[r.agent_id] || 'נציג') : 'נציג',
      contactName: `${r.campaign_contacts?.contacts?.first || ''} ${r.campaign_contacts?.contacts?.last || ''}`.trim(),
      outcomeLabel: OUTCOME_LABELS[r.outcome] || r.outcome, note: r.note, noteType: r.note_type,
      createdAt: formatIsraeliDateTime(r.created_at),
    }));

  const pendingCallbacks = (callbackRows || []).map((r) => ({
    rowId: r.row_id, name: `${r.first || ''} ${r.last || ''}`.trim(), phone: r.phone,
    callbackAt: formatIsraeliDateTime(r.callback_at), scheduledBy: r.scheduled_by ? (nameById[r.scheduled_by] || 'נציג') : 'נציג',
  }));

  const hoursByAgent = computeAgentHours(sessionEvents || [], nameById);

  return {
    success: true, campaignName: campaign.name,
    totals: {
      totalAttempts: Number(totals.total_attempts || 0),
      uniqueContactsAttempted: Number(totals.unique_contacts_attempted || 0),
      remainingInQueue: Number(totals.remaining_in_queue || 0),
    },
    agentTable, notes, pendingCallbacks, hoursByAgent, currentlyClaimed,
  };
}

// "מי תרם אחרי ששוחחנו איתו" - כל הקמפיין, מקובץ לפי נציג-מיוחס (ר'
// get_campaign_donation_attributions, migration 0122). p_agent_id=null
// כאן בכוונה - זו תצוגת-מנהל, רואה את כולם, כולל "לא ניתן לייחס".
export async function getDonationAttributionsForDashboard(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) return { error: 'רק מנהל יכול לראות דשבורד זה' };

  const { data: rows, error } = await supabase.rpc('get_campaign_donation_attributions', { p_campaign_id: campaignId, p_agent_id: null });
  if (error) return { error: error.message };

  const agentIds = Array.from(new Set((rows || []).map((r) => r.attributed_agent_id).filter(Boolean)));
  const { data: profiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));

  // 0127: get_campaign_donation_attributions דורשת עכשיו ניסיון-שיחה
  // אמיתי בקמפיין הזה בשביל כל שורה - attributed_agent_id תמיד קיים,
  // אין יותר "לא ניתן לייחס"/"לא פנינו אליהם" (זה בדיוק הכוונה - רק מי
  // שבאמת פנינו אליו דרך הקמפיין הזה, לא כל מי שנמצא ברשימת-אנשי-הקשר
  // הענקית ותרם מכל סיבה שהיא).
  const byAgent = {};
  for (const r of rows || []) {
    const agentName = nameById[r.attributed_agent_id] || 'נציג';
    if (!byAgent[agentName]) byAgent[agentName] = { agentName, items: [] };
    byAgent[agentName].items.push({
      contactId: r.contact_id, name: `${r.first || ''} ${r.last || ''}`.trim(), phone: r.phone,
      amount: r.amount != null ? Number(r.amount) : null,
      occurredAt: formatIsraeliDateTime(r.occurred_at),
      source: r.source === 'call_attempt' ? 'תויג תוך-כדי-שיחה' : 'זוהה אוטומטית ממערכת קשר',
    });
  }
  return { success: true, byAgent: Object.values(byAgent).sort((a, b) => b.items.length - a.items.length) };
}

// drill-down מתחת ל"באדג'-תוצאה" בטבלת "לפי נציג" - עד 500 ניסיונות
// אחרונים, לא צריך עוד (זו רשימת-עיון, לא דוח מלא).
export async function listCallAttemptsByAgentOutcome(campaignId, agentId, outcome) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) return { error: 'רק מנהל יכול לראות דשבורד זה' };

  let query = supabase.from('campaign_call_attempts')
    .select('id, created_at, campaign_contacts:campaign_contact_id!inner (campaign_id, contact_id, contacts:contact_id (id, first, last, phone))')
    .eq('campaign_contacts.campaign_id', campaignId).eq('outcome', outcome)
    .order('created_at', { ascending: false }).limit(500);
  query = agentId ? query.eq('agent_id', agentId) : query.is('agent_id', null);
  const { data, error } = await query;
  if (error) return { error: error.message };

  const items = (data || []).map((r) => ({
    contactId: r.campaign_contacts?.contacts?.id,
    name: `${r.campaign_contacts?.contacts?.first || ''} ${r.campaign_contacts?.contacts?.last || ''}`.trim(),
    phone: r.campaign_contacts?.contacts?.phone, createdAt: formatIsraeliDateTime(r.created_at),
  }));
  return { success: true, items };
}

// drill-down מתחת לאריח "נותרים בתור" - כל הקמפיין, פאגינציה מלאה (אותו
// דפוס בדיוק כמו fetchAllCampaignMembers ב-page.js, כדי לא להיחתך ב-1000
// PostgREST על קמפיין גדול).
export async function listRemainingInQueueContacts(campaignId) {
  const { supabase, user } = await requireUser();
  const { data: campaign } = await supabase.from('campaigns').select('id, workspace_id').eq('id', campaignId).single();
  if (!campaign) return { error: 'הקמפיין לא נמצא' };
  const allowed = await isManagerOfWorkspace(supabase, user.id, campaign.workspace_id);
  if (!allowed) return { error: 'רק מנהל יכול לראות דשבורד זה' };

  let all = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('campaign_contacts')
      .select('id, category, contacts:contact_id (id, first, last, phone)')
      .eq('campaign_id', campaignId).eq('in_call_queue', true)
      .order('id').range(offset, offset + PAGE - 1);
    if (error) return { error: error.message };
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  const items = all.map((r) => ({
    rowId: r.id, contactId: r.contacts?.id, name: `${r.contacts?.first || ''} ${r.contacts?.last || ''}`.trim(),
    phone: r.contacts?.phone, category: r.category || '',
  }));
  return { success: true, items };
}

// זיווג-אירועים כרונולוגי לכל נציג: start/break_end פותחים חלון-עבודה,
// break_start/end סוגרים אותו - מצטבר לדקות-עבודה בפועל (לא כולל הפסקות).
// "start" חוזר בלי "end" קודם נחשב פתיחה מחדש (למשל אחרי ריענון-דף) - לא
// נספר פעמיים כי workingSince כבר לא-null במקרה כזה.
function computeAgentHours(events, nameById) {
  const byAgent = {};
  for (const e of events) {
    const agentName = e.agent_id ? (nameById[e.agent_id] || 'נציג') : 'לא ידוע';
    if (!byAgent[agentName]) byAgent[agentName] = { minutes: 0, workingSince: null };
    const bucket = byAgent[agentName];
    const t = new Date(e.created_at).getTime();
    if ((e.event_type === 'start' || e.event_type === 'break_end') && bucket.workingSince == null) {
      bucket.workingSince = t;
    } else if ((e.event_type === 'break_start' || e.event_type === 'end') && bucket.workingSince != null) {
      bucket.minutes += (t - bucket.workingSince) / 60000;
      bucket.workingSince = null;
    }
  }
  return Object.entries(byAgent)
    .map(([agentName, b]) => ({ agentName, minutes: Math.round(b.minutes), stillActive: b.workingSince != null }))
    .sort((a, b) => b.minutes - a.minutes);
}
