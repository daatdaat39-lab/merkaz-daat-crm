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

  const [{ data: totalsRows }, { data: statsRows }, { data: notesRows }, { data: callbackRows }, { data: sessionEvents }] = await Promise.all([
    supabase.rpc('get_call_dashboard_totals', { p_campaign_id: campaignId }),
    supabase.rpc('count_call_attempts_stats', { p_campaign_id: campaignId }),
    supabase.from('campaign_call_attempts')
      .select('id, agent_id, outcome, note, note_type, created_at, campaign_contacts:campaign_contact_id!inner (campaign_id, contacts:contact_id (first, last))')
      .eq('campaign_contacts.campaign_id', campaignId)
      .not('note', 'is', null).neq('note', '')
      .order('created_at', { ascending: false }).limit(50),
    supabase.rpc('get_pending_callbacks', { p_campaign_id: campaignId }),
    supabase.from('call_session_events').select('agent_id, event_type, created_at').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
  ]);

  const totals = (totalsRows || [])[0] || { total_attempts: 0, unique_contacts_attempted: 0, remaining_in_queue: 0 };

  const agentIds = Array.from(new Set([
    ...(statsRows || []).map((r) => r.agent_id),
    ...(callbackRows || []).map((r) => r.scheduled_by),
    ...(sessionEvents || []).map((r) => r.agent_id),
  ].filter(Boolean)));
  const { data: profiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));

  const byAgent = {};
  for (const row of statsRows || []) {
    const agentName = row.agent_id ? (nameById[row.agent_id] || 'נציג') : 'לא ידוע';
    if (!byAgent[agentName]) byAgent[agentName] = { agentName, total: 0, outcomes: {} };
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
    agentTable, notes, pendingCallbacks, hoursByAgent,
  };
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
