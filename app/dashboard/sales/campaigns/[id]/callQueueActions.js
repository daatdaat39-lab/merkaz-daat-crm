'use server';

import { createClient } from '../../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMemberOfWorkspace } from '../../../lib/contactGuards';
import { fetchDistinctCampaignCategories, getSegmentRowInsights } from '../actions';
import { formatIsraeliDateTime } from '../../../lib/dateFormat';

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

const OUTCOME_LABELS = {
  no_answer: 'לא ענה',
  donating_now: 'תורם עכשיו תוך כדי הטלפון',
  requested_link: 'ביקש קישור לתרום בעצמו',
  not_interested: 'לא מעוניין לתרום',
  call_back: 'ביקש להתקשר מאוחר יותר',
};

const NOTE_TYPE_LABELS = { donation: 'לגבי תרומה', general: 'כללי', other: 'אחר' };
const NO_ANSWER_REASON_LABELS = { busy: 'תפוס', wrong_number: 'מספר שגוי', voicemail: 'תא קולי' };

const UNDO_WINDOW_MINUTES = 5;

async function fetchAttemptsForCampaignContact(supabase, campaignContactId) {
  const { data: attempts } = await supabase.from('campaign_call_attempts')
    .select('id, agent_id, attempt_number, outcome, note, note_type, callback_at, dedication_text, no_answer_reason, pledge_details, donation_amount, created_at')
    .eq('campaign_contact_id', campaignContactId).order('created_at', { ascending: true });
  const agentIds = Array.from(new Set((attempts || []).map((a) => a.agent_id).filter(Boolean)));
  const { data: profiles } = agentIds.length
    ? await supabase.from('profiles').select('id, name').in('id', agentIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));
  return (attempts || []).map((a) => ({
    id: a.id, attemptNumber: a.attempt_number, agentName: a.agent_id ? (nameById[a.agent_id] || 'נציג') : 'נציג',
    outcome: a.outcome, outcomeLabel: OUTCOME_LABELS[a.outcome] || a.outcome,
    note: a.note || '', noteType: a.note_type, noteTypeLabel: NOTE_TYPE_LABELS[a.note_type] || a.note_type,
    dedicationText: a.dedication_text || '', noAnswerReasonLabel: a.no_answer_reason ? NO_ANSWER_REASON_LABELS[a.no_answer_reason] : '',
    pledgeDetails: a.pledge_details || '', donationAmount: a.donation_amount || null,
    callbackAt: a.callback_at, createdAt: a.created_at,
  }));
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

// "אנשי-קשר קשורים" (לא רק בן/בת-זוג, ר' contact_relations - 0074) +
// "לימודים" (דעת ותבונה/סמינרים/מחזור-ישיבה) - קריאה בלבד, אותו דפוס
// שאילתה בדיוק כמו loadContactCardData.js (כרטיס-הקשר המלא הרגיל).
async function fetchExtendedContactInfo(supabase, contactId) {
  const [
    { data: relForward }, { data: relReverse },
    { data: courses }, { data: seminars }, { data: deptRows },
  ] = await Promise.all([
    supabase.from('contact_relations').select('relation_label, related:related_contact_id (id, first, last)').eq('contact_id', contactId),
    supabase.from('contact_relations').select('relation_label, owner:contact_id (id, first, last)').eq('related_contact_id', contactId),
    supabase.from('contact_course_enrollments').select('course_name, course_code, year_label').eq('contact_id', contactId),
    supabase.from('contact_seminar_participations').select('event_type, year, kind, status').eq('contact_id', contactId),
    supabase.from('contact_departments').select('extra_fields, workspaces:workspace_id (name)').eq('contact_id', contactId),
  ]);

  const relations = [
    ...(relForward || []).filter((r) => r.related).map((r) => ({ contactId: r.related.id, name: `${r.related.first || ''} ${r.related.last || ''}`.trim(), relationLabel: r.relation_label })),
    ...(relReverse || []).filter((r) => r.owner).map((r) => ({ contactId: r.owner.id, name: `${r.owner.first || ''} ${r.owner.last || ''}`.trim(), relationLabel: r.relation_label })),
  ];

  const yeshivaDept = (deptRows || []).find((d) => d.workspaces?.name === 'ישיבת דעת');
  const yeshivaInfo = yeshivaDept?.extra_fields
    ? {
        cohort: yeshivaDept.extra_fields.cohort || null,
        studyYears: yeshivaDept.extra_fields.study_years || null,
        role: yeshivaDept.extra_fields.yeshiva_role || null,
      }
    : null;

  return { relations, courses: courses || [], seminars: seminars || [], yeshivaInfo };
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

  const [insights, attempts, { data: fullContact }, extended] = await Promise.all([
    getSegmentRowInsights(row.contact_id),
    fetchAttemptsForCampaignContact(supabase, row.row_id),
    supabase.from('contacts')
      .select('idnum, birth_date, gender, children_count, city, street, house_number, apartment, zip_code, neighborhood, country, tags, contact_number')
      .eq('id', row.contact_id).maybeSingle(),
    fetchExtendedContactInfo(supabase, row.contact_id),
  ]);

  return {
    success: true,
    contact: {
      rowId: row.row_id, contactId: row.contact_id, category: row.category, status: row.status, note: row.note || '',
      name: `${row.first || ''} ${row.last || ''}`.trim(), first: row.first, last: row.last, phone: row.phone, phone2: row.phone2, email: row.email,
      relatedContactId: row.related_contact_id, relationLabel: row.relation_label,
      spouse: row.related_contact_id ? {
        rowId: row.spouse_row_id, status: row.spouse_status, claimedBy: row.spouse_claimed_by,
      } : null,
      insights,
      attempts,
      personalInfo: fullContact || {},
      relations: extended.relations, courses: extended.courses, seminars: extended.seminars, yeshivaInfo: extended.yeshivaInfo,
    },
  };
}

// רושם ניסיון-שיחה (יומן campaign_call_attempts, מקור-האמת) ומשקף תמצית
// קצרה גם ל-campaign_contacts.note (כדי שטבלת המנהל וה-Google Sheet
// הקיימים ימשיכו להראות משהו משמעותי בלי לגעת בהם).
async function requireOwnClaim(supabase, userId, rowId) {
  const { data: row } = await supabase.from('campaign_contacts').select('id, campaign_id, note, claimed_by').eq('id', rowId).maybeSingle();
  if (!row) return { error: 'איש הקשר לא נמצא' };
  const { error } = await requireMemberOfCampaign(supabase, userId, row.campaign_id);
  if (error) return { error };
  if (row.claimed_by !== userId) return { error: 'איש הקשר הזה כבר לא נעול אצלך - כנראה שהתפיסה פגה' };
  return { row };
}

export async function logCallAttempt(rowId, { outcome, note, noteType, callbackAt, dedicationText, pledgeDetails, donationAmount, newStatus }) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireOwnClaim(supabase, user.id, rowId);
  if (error) return { error };

  const { data: attempt, error: rpcError } = await supabase.rpc('log_campaign_call_attempt', {
    p_campaign_contact_id: row.id, p_agent_id: user.id, p_outcome: outcome,
    p_note: note && note.trim() ? note.trim() : null, p_note_type: noteType || 'general',
    p_callback_at: callbackAt || null,
    p_dedication_text: outcome === 'donating_now' && dedicationText && dedicationText.trim() ? dedicationText.trim() : null,
    p_pledge_details: outcome === 'requested_link' && pledgeDetails && pledgeDetails.trim() ? pledgeDetails.trim() : null,
    p_donation_amount: outcome === 'donating_now' && donationAmount ? Number(donationAmount) : null,
  });
  if (rpcError) return { error: rpcError.message };

  const { data: validStages } = await supabase.from('campaign_stages').select('stage_key').eq('campaign_id', row.campaign_id);
  const validStageKeys = new Set((validStages || []).map((s) => s.stage_key));
  const summary = `[${formatIsraeliDateTime(new Date())}] ${OUTCOME_LABELS[outcome] || outcome}${note && note.trim() ? ` - ${note.trim()}` : ''}`;
  const update = { claimed_by: null, claimed_at: null, note: row.note ? `${summary}\n\n${row.note}` : summary };
  if (newStatus !== undefined && validStageKeys.has(newStatus)) update.status = newStatus;

  const { error: updateError } = await supabase.from('campaign_contacts').update(update).eq('id', rowId);
  if (updateError) return { error: updateError.message };
  return { success: true, attemptId: attempt.id, attemptNumber: attempt.attempt_number, previousNote: row.note || '' };
}

// "לא ענה" - פעולה מיידית: רושמת ניסיון, משחררת את התפיסה, ומחזירה את
// מזהה-הניסיון + ההערה הקודמת כדי שהלקוח יוכל להציע "בטל" מיד אחר כך.
export async function quickNoAnswer(rowId, { note, noteType, reason } = {}) {
  const { supabase, user } = await requireUser();
  const { row, error } = await requireOwnClaim(supabase, user.id, rowId);
  if (error) return { error };

  const { data: attempt, error: rpcError } = await supabase.rpc('log_campaign_call_attempt', {
    p_campaign_contact_id: row.id, p_agent_id: user.id, p_outcome: 'no_answer',
    p_note: note && note.trim() ? note.trim() : null, p_note_type: noteType || 'general',
    p_no_answer_reason: reason || null,
  });
  if (rpcError) return { error: rpcError.message };

  const reasonLabel = reason ? ` (${NO_ANSWER_REASON_LABELS[reason] || reason})` : '';
  const summary = `[${formatIsraeliDateTime(new Date())}] ${OUTCOME_LABELS.no_answer}${reasonLabel}${note && note.trim() ? ` - ${note.trim()}` : ''}`;
  const mirroredNote = row.note ? `${summary}\n\n${row.note}` : summary;
  const { error: updateError } = await supabase.from('campaign_contacts')
    .update({ claimed_by: null, claimed_at: null, note: mirroredNote }).eq('id', rowId);
  if (updateError) return { error: updateError.message };

  return { success: true, attemptId: attempt.id, attemptNumber: attempt.attempt_number, previousNote: row.note || '' };
}

// מבטל את הניסיון האחרון - רק אם הוא עדיין הכי-אחרון על השורה, של אותו
// נציג, ותוך חלון-זמן קצר. משחזר את ההערה הקודמת ומנסה לתפוס מחדש עבור
// אותו נציג (יכול להיכשל בעדינות אם מישהו אחר כבר הספיק לתפוס).
export async function undoLastCallAttempt(attemptId, rowId, previousNote) {
  const { supabase, user } = await requireUser();
  const { data: attempt } = await supabase.from('campaign_call_attempts')
    .select('id, campaign_contact_id, agent_id, created_at').eq('id', attemptId).maybeSingle();
  if (!attempt) return { error: 'הניסיון לא נמצא - כנראה כבר בוטל' };
  if (attempt.agent_id !== user.id) return { error: 'אפשר לבטל רק ניסיון שאתה רשמת' };

  const { data: latest } = await supabase.from('campaign_call_attempts')
    .select('id').eq('campaign_contact_id', attempt.campaign_contact_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!latest || latest.id !== attemptId) return { error: 'כבר נרשם ניסיון חדש יותר על איש הקשר הזה - אי אפשר לבטל' };

  const minutesPassed = (Date.now() - new Date(attempt.created_at).getTime()) / 60000;
  if (minutesPassed > UNDO_WINDOW_MINUTES) return { error: `אפשר לבטל רק עד ${UNDO_WINDOW_MINUTES} דקות אחרי הרישום` };

  const { error: deleteError } = await supabase.rpc('delete_campaign_call_attempt', { p_attempt_id: attemptId });
  if (deleteError) return { error: deleteError.message };

  await supabase.from('campaign_contacts').update({ note: previousNote || null }).eq('id', rowId);

  const { data: reclaimed } = await supabase.from('campaign_contacts')
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', rowId).or(`claimed_by.is.null,claimed_by.eq.${user.id}`).select('id').maybeSingle();

  return { success: true, reclaimed: !!reclaimed };
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

// אירועי-משמרת (call_session_events, migration 0099) - "התחלה" נרשמת
// אוטומטית בתפיסה הראשונה (לא כפתור נפרד, פחות חיכוך), הפסקה/סיום הם
// מצבי-UI בלבד ב-CallQueueClient.js - לא נוגעים בהרשאת-התפקיד/middleware.
async function logSessionEvent(campaignId, eventType) {
  const { supabase, user } = await requireUser();
  const { error } = await requireMemberOfCampaign(supabase, user.id, campaignId);
  if (error) return { error };
  const { error: insertError } = await supabase.from('call_session_events')
    .insert({ agent_id: user.id, campaign_id: campaignId, event_type: eventType });
  if (insertError) return { error: insertError.message };
  return { success: true };
}

export async function startCallSession(campaignId) { return logSessionEvent(campaignId, 'start'); }
export async function logBreakStart(campaignId) { return logSessionEvent(campaignId, 'break_start'); }
export async function logBreakEnd(campaignId) { return logSessionEvent(campaignId, 'break_end'); }
export async function endCallSession(campaignId) { return logSessionEvent(campaignId, 'end'); }
